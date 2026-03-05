'use strict';

const express = require('express');
const axios = require('axios');
const crypto = require('node:crypto');

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || 8080);
const mockBaseUrl = process.env.MOCKSERVER_BASE_URL || 'http://mockserver:1080';
const targetPlatformBaseUrl = process.env.TARGET_PLATFORM_BASE_URL || 'http://ticket-platform:80';
const pollingPlatformBaseUrl = process.env.POLLING_PLATFORM_BASE_URL || targetPlatformBaseUrl;
const platformUpdatedTicketsPath = process.env.PLATFORM_UPDATED_TICKETS_PATH || '/ticket-platform/v1/tickets/updated';
const platformGitlabUpdatedPath = process.env.PLATFORM_GITLAB_UPDATED_PATH || '/gitlab/api/v4/projects/42/issues';
const platformGithubUpdatedPath = process.env.PLATFORM_GITHUB_UPDATED_PATH || '/github/api/v3/repos/workforce/sample/issues';
const platformJiraSearchPath = process.env.PLATFORM_JIRA_SEARCH_PATH || '/jira/rest/api/3/search';
const platformPlaneUpdatedPath = process.env.PLATFORM_PLANE_UPDATED_PATH || '/plane/api/v1/workspaces/workspace-qa/issues';
const configuredPollingTargets = String(process.env.PLATFORM_POLLING_TARGETS || 'focalboard')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const platformPollingTargets = configuredPollingTargets.length > 0
  ? Array.from(new Set(configuredPollingTargets))
  : ['focalboard'];
const platformPollingEnabled = String(process.env.PLATFORM_POLLING_ENABLED || 'true') === 'true';
const platformWebhookEnabled = String(process.env.PLATFORM_WEBHOOK_ENABLED || 'false') === 'true';
const platformPollIntervalMs = Number(process.env.PLATFORM_POLL_INTERVAL_MS || 2000);

const tickets = new Map();
const platformTicketMap = new Map();
const connectionRegistry = new Map();
const egressAuditEvents = [];
const maxEgressAuditEvents = 2000;

let lastPlatformPollAt = null;
let totalIngestedFromPolling = 0;
let pollInFlight = false;

const nowIso = () => new Date().toISOString();
const makeId = () => `t_${crypto.randomUUID()}`;
const makeExecutionId = () => `e_${crypto.randomUUID()}`;
const toStringArray = (value) => (Array.isArray(value) ? value.map((item) => String(item)) : []);
const supportedPlatforms = new Set(['gitlab', 'github', 'jira', 'plane', 'focalboard']);
const supportedAuthTypes = new Set(['token', 'app', 'oauth']);
const supportedConnectionStatus = new Set(['active', 'paused', 'disabled']);

const defaultUpdatedPathByPlatform = {
  focalboard: platformUpdatedTicketsPath,
  gitlab: platformGitlabUpdatedPath,
  github: platformGithubUpdatedPath,
  jira: platformJiraSearchPath,
  plane: platformPlaneUpdatedPath
};

const getTicket = (ticketId) => tickets.get(ticketId);

const toError = (code, message) => ({ code, message });
const normalizePlatform = (value, fallback = 'focalboard') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (supportedPlatforms.has(candidate)) {
    return candidate;
  }
  return fallback;
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
};

const normalizeInteger = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.trunc(parsed);
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
};

const normalizeBaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return raw.replace(/\/$/, '');
};

const normalizePath = (value, fallback) => {
  const raw = normalizeOptionalString(value) || fallback;
  if (!raw) {
    return fallback;
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
};

const joinUrl = (baseUrl, requestPath) => {
  const base = normalizeBaseUrl(baseUrl);
  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  return `${base}${path}`;
};

const toScopeKey = (connection) => {
  return [
    connection.platformType,
    connection.workspaceId,
    connection.boardId || '',
    connection.project || '',
    connection.repo || ''
  ].join('|');
};

const toUniquenessKey = (connection) => {
  return [
    connection.platformType,
    connection.workspaceId,
    connection.baseUrl,
    connection.boardId || '',
    connection.project || '',
    connection.repo || ''
  ].join('|');
};

const toDefaultScopeKey = (connection) => `${connection.platformType}|${connection.workspaceId}`;

const pushEgressAudit = (event) => {
  egressAuditEvents.push({
    ...event,
    at: nowIso()
  });

  if (egressAuditEvents.length > maxEgressAuditEvents) {
    egressAuditEvents.splice(0, egressAuditEvents.length - maxEgressAuditEvents);
  }
};

const listConnections = () => {
  return Array.from(connectionRegistry.values()).sort((left, right) => {
    return left.connectionId.localeCompare(right.connectionId);
  });
};

const validateConnectionRules = (candidate, ignoreConnectionId) => {
  const uniquenessKey = toUniquenessKey(candidate);
  for (const existing of connectionRegistry.values()) {
    if (existing.connectionId === ignoreConnectionId) {
      continue;
    }

    if (toUniquenessKey(existing) === uniquenessKey) {
      return toError('DUPLICATE_CONNECTION_KEY', 'duplicate uniqueness key is not allowed');
    }
  }

  if (candidate.isDefault) {
    const defaultScopeKey = toDefaultScopeKey(candidate);
    for (const existing of connectionRegistry.values()) {
      if (existing.connectionId === ignoreConnectionId) {
        continue;
      }

      if (existing.isDefault && toDefaultScopeKey(existing) === defaultScopeKey) {
        return toError('DEFAULT_CONNECTION_CONFLICT', 'only one default connection is allowed per platform/workspace scope');
      }
    }
  }

  return null;
};

const normalizeConnectionPayload = (payload, previousConnection = null) => {
  if (!payload || typeof payload !== 'object') {
    return { error: toError('BAD_REQUEST', 'connection payload must be an object') };
  }

  const source = payload;
  const previous = previousConnection || {};

  const connectionId = normalizeOptionalString(source.connectionId) || previous.connectionId;
  const platformType = normalizePlatform(source.platformType, previous.platformType || '');
  const workspaceId = normalizeOptionalString(source.workspaceId) || previous.workspaceId;
  const baseUrl = normalizeBaseUrl(source.baseUrl !== undefined ? source.baseUrl : previous.baseUrl);
  const authType = normalizeOptionalString(source.authType) || previous.authType;
  const secretRefId = normalizeOptionalString(source.secretRefId) || previous.secretRefId;

  if (!connectionId) {
    return { error: toError('BAD_REQUEST', 'connectionId is required') };
  }

  if (!supportedPlatforms.has(platformType)) {
    return { error: toError('BAD_REQUEST', 'platformType must be one of gitlab|github|jira|plane|focalboard') };
  }

  if (!workspaceId) {
    return { error: toError('BAD_REQUEST', 'workspaceId is required') };
  }

  if (!baseUrl) {
    return { error: toError('BAD_REQUEST', 'baseUrl is required') };
  }

  if (!authType || !supportedAuthTypes.has(authType)) {
    return { error: toError('BAD_REQUEST', 'authType must be one of token|app|oauth') };
  }

  if (!secretRefId) {
    return { error: toError('BAD_REQUEST', 'secretRefId is required') };
  }

  const updatedPath = normalizePath(
    source.updatedPath !== undefined ? source.updatedPath : previous.updatedPath,
    defaultUpdatedPathByPlatform[platformType]
  );

  const normalized = {
    connectionId,
    platformType,
    workspaceId,
    boardId: normalizeOptionalString(source.boardId !== undefined ? source.boardId : previous.boardId),
    project: normalizeOptionalString(source.project !== undefined ? source.project : previous.project),
    repo: normalizeOptionalString(source.repo !== undefined ? source.repo : previous.repo),
    baseUrl,
    updatedPath,
    authType,
    secretRefId,
    pollingEnabled: normalizeBoolean(
      source.pollingEnabled !== undefined ? source.pollingEnabled : previous.pollingEnabled,
      true
    ),
    pollingIntervalSec: Math.max(1, normalizeInteger(
      source.pollingIntervalSec !== undefined ? source.pollingIntervalSec : previous.pollingIntervalSec,
      Math.max(1, Math.floor(platformPollIntervalMs / 1000))
    )),
    webhookEnabled: normalizeBoolean(
      source.webhookEnabled !== undefined ? source.webhookEnabled : previous.webhookEnabled,
      false
    ),
    status: normalizeOptionalString(source.status !== undefined ? source.status : previous.status) || 'active',
    priority: normalizeInteger(source.priority !== undefined ? source.priority : previous.priority, 100),
    isDefault: normalizeBoolean(source.isDefault !== undefined ? source.isDefault : previous.isDefault, false),
    connectionCheckPassed: normalizeBoolean(previous.connectionCheckPassed, false),
    connectionCheckMessage: normalizeOptionalString(previous.connectionCheckMessage) || '',
    createdAt: previous.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  if (!supportedConnectionStatus.has(normalized.status)) {
    return { error: toError('BAD_REQUEST', 'status must be one of active|paused|disabled') };
  }

  return { connection: normalized };
};

const seedDefaultConnections = () => {
  platformPollingTargets.forEach((target, index) => {
    if (!supportedPlatforms.has(target)) {
      return;
    }

    const payload = {
      connectionId: `seed-${target}`,
      platformType: target,
      workspaceId: 'workspace-qa',
      baseUrl: pollingPlatformBaseUrl,
      updatedPath: defaultUpdatedPathByPlatform[target],
      authType: 'token',
      secretRefId: `seed-${target}-secret`,
      pollingEnabled: true,
      pollingIntervalSec: Math.max(1, Math.floor(platformPollIntervalMs / 1000)),
      webhookEnabled: platformWebhookEnabled,
      status: 'active',
      priority: index + 1,
      isDefault: true
    };

    const normalized = normalizeConnectionPayload(payload);
    if (!normalized.connection) {
      return;
    }

    connectionRegistry.set(normalized.connection.connectionId, normalized.connection);
  });
};

const normalizeDimensionValue = (value, fallback = 'low') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!candidate) {
    return fallback;
  }
  return candidate;
};

const hasAnyPattern = (value, patterns) => {
  const source = String(value || '');
  return patterns.some((pattern) => pattern.test(source));
};

const hasNonEmptyValue = (value) => String(value || '').trim().length > 0;

const deriveDelegationDimensionsFromSignals = (ticket) => {
  const title = String(ticket.title || '');
  const description = String(ticket.description || '');
  const labels = Array.isArray(ticket.labels) ? ticket.labels.map((label) => String(label)) : [];
  const grants = Array.isArray(ticket.grant_ref_ids) ? ticket.grant_ref_ids.map((grant) => String(grant)) : [];
  const joinedSignals = `${title}\n${description}\n${labels.join('\n')}`.toLowerCase();

  const has = (pattern) => pattern.test(joinedSignals);

  const constraints = has(/\bhuman[-\s]?only\b/) ? 'human_only'
    : has(/\blegal\b|\bregulatory\b|\bcompliance\b/) ? 'legal'
      : has(/\bpolicy\b|\brestricted\b/) ? 'high'
        : 'low';

  const monitoring_mode = has(/\bcontinuous monitoring\b|\breal[-\s]?time\b|\b24\/7\b/) ? 'continuous'
    : has(/\bcheckpoint\b|\bprocess monitor(ing)?\b/) ? 'process'
      : 'outcome';

  return {
    complexity: has(/\bcomplex\b|\bmulti[-\s]?step\b|\bcross[-\s]?service\b|\bmigration\b/) ? 'high' : 'low',
    criticality: has(/\bproduction\b|\bcritical\b|\bp0\b|\bp1\b|\bcustomer impact\b/) ? 'high' : 'low',
    uncertainty: has(/\bunclear\b|\bunknown\b|\btbd\b|\binvestigate\b|\bexplore\b/) ? 'high' : 'low',
    cost: has(/\bhigh effort\b|\bexpensive\b|\bweeks?\b|\bmonths?\b/) ? 'high' : 'low',
    resource_requirements: has(/\bdb admin\b|\bcluster access\b|\bmultiple teams?\b|\boncall\b/) ? 'high' : 'low',
    constraints,
    verifiability: has(/\bsubjective\b|\bcannot test\b|\bno tests?\b|\bmanual judgment\b/) ? 'low' : 'high',
    reversibility: has(/\birreversible\b|\bcannot rollback\b|\bdata loss\b/) ? 'low' : 'high',
    contextuality: has(/\bpii\b|\bconfidential\b|\bsensitive\b|\binternal only\b/) ? 'high' : 'low',
    subjectivity: has(/\baesthetic\b|\bopinion\b|\bpreference\b/) ? 'high' : 'low',
    autonomy_level: has(/\bfully automatic\b|\bautonomous\b|\bwithout approval\b/) ? 'high' : 'low',
    monitoring_mode,
    _grantSignal: grants.some((grant) => grant.toLowerCase().includes('admin')) ? 'high' : 'low'
  };
};

const evaluateEligibilityContract = (ticket) => {
  const title = String(ticket.title || '').toLowerCase();
  const description = String(ticket.description || '').trim();
  const labels = Array.isArray(ticket.labels) ? ticket.labels.map((label) => String(label)) : [];
  const inspectionAnswers = ticket.inspectionAnswers && typeof ticket.inspectionAnswers === 'object'
    ? ticket.inspectionAnswers
    : {};
  const dimensions = deriveDelegationDimensionsFromSignals(ticket);

  if (title.includes('privileged') && (!Array.isArray(ticket.grant_ref_ids) || ticket.grant_ref_ids.length === 0)) {
    return {
      is_ai_processable: false,
      decision_confidence: 'high',
      reason_codes: ['HARD_POLICY_BLOCK'],
      requires_inspection: false
    };
  }

  const constraints = normalizeDimensionValue(dimensions.constraints, 'low');
  if (constraints === 'legal' || constraints === 'human_only') {
    return {
      is_ai_processable: false,
      decision_confidence: 'high',
      reason_codes: ['HARD_POLICY_BLOCK'],
      requires_inspection: false
    };
  }

  const criticality = normalizeDimensionValue(dimensions.criticality, 'low');
  const verifiability = normalizeDimensionValue(dimensions.verifiability, 'high');
  const reversibility = normalizeDimensionValue(dimensions.reversibility, 'high');
  const hasUnsafeTriad = criticality === 'high' && verifiability === 'low' && reversibility === 'low';

  const hasDefinitionOfDone = hasAnyPattern(description, [/(definition\s+of\s+done|dod)\s*:/i])
    || hasNonEmptyValue(inspectionAnswers.definition_of_done);
  const hasOutputFormat = hasAnyPattern(description, [/(output\s*format|deliverable|artifact)\s*:\s*(code|mr|doc|attachment)/i])
    || hasNonEmptyValue(inspectionAnswers.output_format);
  const hasAllowedSystems = hasAnyPattern(description, [/allowed\s+systems\s*:/i])
    || hasNonEmptyValue(inspectionAnswers.allowed_systems);
  const hasProhibitedSystems = hasAnyPattern(description, [/prohibited\s+systems\s*:/i])
    || hasNonEmptyValue(inspectionAnswers.prohibited_systems);
  const hasPriority = labels.some((label) => /^priority:/i.test(label))
    || hasAnyPattern(description, [/priority\s*:/i])
    || hasNonEmptyValue(inspectionAnswers.priority);
  const hasDueDate = labels.some((label) => /^due:/i.test(label))
    || hasAnyPattern(description, [/(due\s*date|deadline)\s*:/i])
    || hasNonEmptyValue(inspectionAnswers.deadline)
    || hasNonEmptyValue(inspectionAnswers.due_date);

  const inspectionStartReasons = [];
  const isIngestedTicket = hasNonEmptyValue(ticket.id) || hasNonEmptyValue(ticket.sourcePlatformTicketId);
  if (!hasDefinitionOfDone) {
    inspectionStartReasons.push('MISSING_DEFINITION_OF_DONE');
  }

  if (!hasOutputFormat) {
    inspectionStartReasons.push('UNCLEAR_OUTPUT_FORMAT');
  }

  if (!(hasAllowedSystems && hasProhibitedSystems)) {
    inspectionStartReasons.push('MISSING_SYSTEM_BOUNDARY');
  }

  if (!(hasPriority && hasDueDate)) {
    inspectionStartReasons.push('MISSING_PRIORITY_OR_DUE_DATE');
  }

  if (isIngestedTicket && (!description || inspectionStartReasons.length > 0)) {
    const reasonCodes = inspectionStartReasons.length > 0 ? inspectionStartReasons : ['INSUFFICIENT_INPUT'];
    return {
      is_ai_processable: true,
      decision_confidence: 'low',
      reason_codes: reasonCodes,
      requires_inspection: true
    };
  }

  if (hasUnsafeTriad) {
    return {
      is_ai_processable: true,
      decision_confidence: 'medium',
      reason_codes: ['NEEDS_CLARIFICATION'],
      requires_inspection: true
    };
  }

  const highRiskFields = [
    normalizeDimensionValue(dimensions.complexity, 'low'),
    normalizeDimensionValue(dimensions.criticality, 'low'),
    normalizeDimensionValue(dimensions.uncertainty, 'low'),
    normalizeDimensionValue(dimensions.cost, 'low'),
    normalizeDimensionValue(dimensions.resource_requirements, 'low'),
    normalizeDimensionValue(dimensions.contextuality, 'low'),
    normalizeDimensionValue(dimensions.subjectivity, 'low'),
    normalizeDimensionValue(dimensions.autonomy_level, 'low'),
    normalizeDimensionValue(dimensions._grantSignal, 'low')
  ];

  const monitoringMode = normalizeDimensionValue(dimensions.monitoring_mode, 'outcome');

  let ruleScore = 85;
  for (const value of highRiskFields) {
    if (value === 'high') {
      ruleScore -= 12;
    }
  }
  if (constraints === 'high') {
    ruleScore -= 12;
  }
  if (verifiability === 'low') {
    ruleScore -= 18;
  }
  if (reversibility === 'low') {
    ruleScore -= 18;
  }
  if (monitoringMode === 'continuous') {
    ruleScore -= 12;
  }
  if (verifiability === 'low' && reversibility === 'low') {
    ruleScore -= 8;
  }
  ruleScore = Math.max(0, ruleScore);

  const llmScore = ruleScore;
  const finalScore = Math.round((0.6 * ruleScore) + (0.4 * llmScore));

  if (finalScore < 60) {
    return {
      is_ai_processable: false,
      decision_confidence: 'medium',
      reason_codes: ['LOW_FEASIBILITY'],
      requires_inspection: false
    };
  }

  if (finalScore < 75) {
    return {
      is_ai_processable: true,
      decision_confidence: 'medium',
      reason_codes: ['NEEDS_CLARIFICATION'],
      requires_inspection: true
    };
  }

  return {
    is_ai_processable: true,
    decision_confidence: 'high',
    reason_codes: [],
    requires_inspection: false
  };
};

const transition = (ticket, nextState) => {
  ticket.state = nextState;
  ticket.updatedAt = nowIso();
};

const normalizePolledTicket = (payload, defaultPlatform = 'focalboard') => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sourceTicketId = payload.ticketId ?? payload.id;
  if (!sourceTicketId) {
    return null;
  }

  return {
    sourceTicketId: String(sourceTicketId),
    platform: normalizePlatform(payload.platform, defaultPlatform),
    title: String(payload.title || 'Untitled platform ticket'),
    description: String(payload.description || ''),
    requester: String(payload.requester || 'platform'),
    labels: toStringArray(payload.labels),
    grant_ref_ids: toStringArray(payload.grant_ref_ids)
  };
};

const normalizeGitLabIssue = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const issue = payload;
  const author = issue.author && typeof issue.author === 'object' ? issue.author : {};
  return normalizePolledTicket({
    platform: 'gitlab',
    ticketId: issue.iid ?? issue.id,
    title: issue.title,
    description: issue.description,
    requester: author.username,
    labels: issue.labels,
    grant_ref_ids: issue.grant_ref_ids
  }, 'gitlab');
};

const normalizeGitHubIssue = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const issue = payload;
  const user = issue.user && typeof issue.user === 'object' ? issue.user : {};
  const labelNames = Array.isArray(issue.labels)
    ? issue.labels
      .map((label) => {
        if (label && typeof label === 'object') {
          return label.name ? String(label.name) : '';
        }
        return String(label);
      })
      .filter(Boolean)
    : [];

  return normalizePolledTicket({
    platform: 'github',
    ticketId: issue.number ?? issue.id,
    title: issue.title,
    description: issue.body,
    requester: user.login,
    labels: labelNames,
    grant_ref_ids: issue.grant_ref_ids
  }, 'github');
};

const normalizeJiraIssue = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const issue = payload;
  const fields = issue.fields && typeof issue.fields === 'object' ? issue.fields : {};
  const reporter = fields.reporter && typeof fields.reporter === 'object' ? fields.reporter : {};
  const description = typeof fields.description === 'string' ? fields.description : '';
  const grantRefIds = fields.grant_ref_ids ?? fields.customfield_grant_ref_ids;

  return normalizePolledTicket({
    platform: 'jira',
    ticketId: issue.key ?? issue.id,
    title: fields.summary,
    description,
    requester: reporter.displayName ?? reporter.name,
    labels: fields.labels,
    grant_ref_ids: grantRefIds
  }, 'jira');
};

const normalizePlaneIssue = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const issue = payload;
  const creator = issue.creator && typeof issue.creator === 'object' ? issue.creator : {};
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((label) => {
      if (label && typeof label === 'object') {
        return label.name ? String(label.name) : '';
      }
      return String(label);
    }).filter(Boolean)
    : [];

  return normalizePolledTicket({
    platform: 'plane',
    ticketId: issue.key ?? issue.id,
    title: issue.title ?? issue.name,
    description: issue.description ?? issue.body,
    requester: creator.name ?? issue.requester,
    labels,
    grant_ref_ids: issue.grant_ref_ids ?? issue.custom_fields?.grant_ref_ids
  }, 'plane');
};

const requestPlatform = async (connection, params) => {
  const timeout = 7000;
  const requestPath = connection.updatedPath;

  try {
    const response = await axios.get(joinUrl(connection.baseUrl, requestPath), {
      timeout,
      params,
      validateStatus: () => true
    });

    pushEgressAudit({
      source: 'ingester',
      connectionId: connection.connectionId,
      platformType: connection.platformType,
      method: 'GET',
      path: requestPath,
      status: response.status
    });

    return response;
  } catch (error) {
    pushEgressAudit({
      source: 'ingester',
      connectionId: connection.connectionId,
      platformType: connection.platformType,
      method: 'GET',
      path: requestPath,
      status: 0,
      errorCode: 'NETWORK_ERROR'
    });

    throw error;
  }
};

const fetchUpdatedTicketsForConnection = async (connection) => {
  if (connection.platformType === 'focalboard') {
    const response = await requestPlatform(connection);
    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      return [];
    }

    return response.data.map((raw) => normalizePolledTicket(raw, 'focalboard')).filter(Boolean);
  }

  if (connection.platformType === 'gitlab') {
    const response = await requestPlatform(connection, {
      scope: 'all',
      per_page: 20,
      updated_after: nowIso()
    });

    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      return [];
    }

    return response.data.map(normalizeGitLabIssue).filter(Boolean);
  }

  if (connection.platformType === 'github') {
    const response = await requestPlatform(connection, {
      state: 'all',
      per_page: 20,
      since: nowIso()
    });

    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      return [];
    }

    return response.data.map(normalizeGitHubIssue).filter(Boolean);
  }

  if (connection.platformType === 'jira') {
    const response = await requestPlatform(connection, {
      maxResults: 20,
      jql: 'updated >= -5m ORDER BY updated DESC'
    });

    const issues = response.data && typeof response.data === 'object' ? response.data.issues : null;
    if (response.status < 200 || response.status >= 300 || !Array.isArray(issues)) {
      return [];
    }

    return issues.map(normalizeJiraIssue).filter(Boolean);
  }

  if (connection.platformType === 'plane') {
    const response = await requestPlatform(connection, {
      limit: 20,
      updated_after: nowIso()
    });

    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      return [];
    }

    return response.data.map(normalizePlaneIssue).filter(Boolean);
  }

  return [];
};

const buildConnectionCheckParams = (platformType) => {
  if (platformType === 'gitlab') {
    return {
      scope: 'all',
      per_page: 1,
      updated_after: nowIso()
    };
  }

  if (platformType === 'github') {
    return {
      state: 'all',
      per_page: 1,
      since: nowIso()
    };
  }

  if (platformType === 'jira') {
    return {
      maxResults: 1,
      jql: 'updated >= -5m ORDER BY updated DESC'
    };
  }

  if (platformType === 'plane') {
    return {
      limit: 1,
      updated_after: nowIso()
    };
  }

  return undefined;
};

const checkPlatformConnection = async (connection) => {
  try {
    const response = await requestPlatform(connection, buildConnectionCheckParams(connection.platformType));
    if (response.status >= 200 && response.status < 300) {
      return {
        passed: true,
        message: 'platform connection check passed'
      };
    }

    return {
      passed: false,
      message: `platform connection check failed with status ${response.status}`
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      passed: false,
      message: `platform connection check failed: ${reason}`
    };
  }
};

const ingestPolledTicket = (ticketFromPlatform, connection) => {
  if (platformTicketMap.has(ticketFromPlatform.sourceTicketId)) {
    return;
  }

  const ticketId = makeId();
  const ticket = {
    id: ticketId,
    sourceConnectionId: connection.connectionId,
    sourcePlatformTicketId: ticketFromPlatform.sourceTicketId,
    sourcePlatform: ticketFromPlatform.platform,
    title: ticketFromPlatform.title,
    description: ticketFromPlatform.description,
    requester: ticketFromPlatform.requester,
    labels: ticketFromPlatform.labels,
    grant_ref_ids: ticketFromPlatform.grant_ref_ids,
    inspectionAnswers: {},
    state: 'NEW',
    updatedAt: nowIso()
  };

  transition(ticket, 'TRIAGE_PENDING');
  transition(ticket, 'TRIAGE_DONE');

  tickets.set(ticketId, ticket);
  platformTicketMap.set(ticketFromPlatform.sourceTicketId, ticketId);
  totalIngestedFromPolling += 1;
};

const resolvePollingConnections = () => {
  const candidates = Array.from(connectionRegistry.values())
    .filter((connection) => connection.status === 'active' && connection.pollingEnabled)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      return left.connectionId.localeCompare(right.connectionId);
    });

  const selectedByScope = new Map();

  for (const connection of candidates) {
    const scopeKey = toScopeKey(connection);
    if (!selectedByScope.has(scopeKey)) {
      selectedByScope.set(scopeKey, connection);
    }
  }

  return Array.from(selectedByScope.values());
};

const pollUpdatedTicketsFromPlatform = async () => {
  if (!platformPollingEnabled || platformWebhookEnabled || pollInFlight) {
    return { polledConnectionCount: 0 };
  }

  pollInFlight = true;
  lastPlatformPollAt = nowIso();

  try {
    const pollingConnections = resolvePollingConnections();
    if (pollingConnections.length === 0) {
      pushEgressAudit({
        source: 'ingester',
        method: 'RESOLVE',
        path: 'PLATFORM_CONFIG_NOT_FOUND',
        status: 0,
        errorCode: 'PLATFORM_CONFIG_NOT_FOUND'
      });
    }

    for (const connection of pollingConnections) {
      let normalizedTickets = [];
      try {
        normalizedTickets = await fetchUpdatedTicketsForConnection(connection);
      } catch (_error) {
        normalizedTickets = [];
      }

      for (const ticketFromPlatform of normalizedTickets) {
        ingestPolledTicket(ticketFromPlatform, connection);
      }
    }

    return { polledConnectionCount: pollingConnections.length };
  } catch (_error) {
    return { polledConnectionCount: 0 };
  } finally {
    pollInFlight = false;
  }
};

const runExternalRequest = async (method, requestPath, payload) => {
  const timeout = 7000;

  try {
    const response = await axios({
      method,
      url: joinUrl(mockBaseUrl, requestPath),
      data: payload,
      timeout,
      validateStatus: () => true
    });

    pushEgressAudit({
      source: 'executor',
      method: method.toUpperCase(),
      path: requestPath,
      status: response.status
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`external request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    pushEgressAudit({
      source: 'executor',
      method: method.toUpperCase(),
      path: requestPath,
      status: 0,
      errorCode: 'EXTERNAL_REQUEST_FAILED'
    });

    throw error;
  }
};

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/v1/ingester/connections', (req, res) => {
  const normalized = normalizeConnectionPayload(req.body);
  if (normalized.error) {
    return res.status(400).json(normalized.error);
  }

  const connection = normalized.connection;
  if (connectionRegistry.has(connection.connectionId)) {
    return res.status(409).json(toError('CONNECTION_ALREADY_EXISTS', 'connectionId already exists'));
  }

  const ruleError = validateConnectionRules(connection);
  if (ruleError) {
    return res.status(409).json(ruleError);
  }

  return checkPlatformConnection(connection).then((checkResult) => {
    if (!checkResult.passed) {
      return res.status(400).json(toError('PLATFORM_CONNECTION_CHECK_FAILED', checkResult.message));
    }

    const toSave = {
      ...connection,
      connectionCheckPassed: true,
      connectionCheckMessage: checkResult.message
    };

    connectionRegistry.set(toSave.connectionId, toSave);
    return res.status(201).json(toSave);
  });
});

app.get('/v1/ingester/connections', (_req, res) => {
  return res.status(200).json({ connections: listConnections() });
});

app.get('/v1/ingester/connections/:connectionId', (req, res) => {
  const connection = connectionRegistry.get(req.params.connectionId);
  if (!connection) {
    return res.status(404).json(toError('NOT_FOUND', 'connection not found'));
  }

  return res.status(200).json(connection);
});

app.put('/v1/ingester/connections/:connectionId', (req, res) => {
  const existing = connectionRegistry.get(req.params.connectionId);
  if (!existing) {
    return res.status(404).json(toError('NOT_FOUND', 'connection not found'));
  }

  const normalized = normalizeConnectionPayload({
    ...req.body,
    connectionId: req.params.connectionId
  }, existing);

  if (normalized.error) {
    return res.status(400).json(normalized.error);
  }

  const ruleError = validateConnectionRules(normalized.connection, req.params.connectionId);
  if (ruleError) {
    return res.status(409).json(ruleError);
  }

  return checkPlatformConnection(normalized.connection).then((checkResult) => {
    if (!checkResult.passed) {
      return res.status(400).json(toError('PLATFORM_CONNECTION_CHECK_FAILED', checkResult.message));
    }

    const toSave = {
      ...normalized.connection,
      connectionCheckPassed: true,
      connectionCheckMessage: checkResult.message
    };

    connectionRegistry.set(req.params.connectionId, toSave);
    return res.status(200).json(toSave);
  });
});

app.delete('/v1/ingester/connections/:connectionId', (req, res) => {
  const deleted = connectionRegistry.delete(req.params.connectionId);
  if (!deleted) {
    return res.status(404).json(toError('NOT_FOUND', 'connection not found'));
  }

  return res.status(204).send();
});

app.post('/v1/ingester/poll', async (_req, res) => {
  const result = await pollUpdatedTicketsFromPlatform();
  return res.status(202).json({
    accepted: true,
    polledConnectionCount: result.polledConnectionCount,
    lastPollAt: lastPlatformPollAt
  });
});

app.get('/v1/ingester/audit/egress', (req, res) => {
  const methodFilter = normalizeOptionalString(req.query.method);
  const pathFilter = normalizeOptionalString(req.query.path);
  const connectionIdFilter = normalizeOptionalString(req.query.connectionId);

  const events = egressAuditEvents.filter((event) => {
    if (methodFilter && String(event.method).toUpperCase() !== methodFilter.toUpperCase()) {
      return false;
    }

    if (pathFilter && event.path !== pathFilter) {
      return false;
    }

    if (connectionIdFilter && event.connectionId !== connectionIdFilter) {
      return false;
    }

    return true;
  });

  return res.status(200).json({ events });
});

app.post('/v1/tickets', (req, res) => {
  const { title, description, requester, labels, grant_ref_ids } = req.body || {};

  if (!title || !requester) {
    return res.status(400).json(toError('BAD_REQUEST', 'title and requester are required'));
  }

  const ticketId = makeId();
  const ticket = {
    id: ticketId,
    title: String(title),
    description: String(description || ''),
    requester: String(requester),
    labels: Array.isArray(labels) ? labels.map(String) : [],
    grant_ref_ids: Array.isArray(grant_ref_ids) ? grant_ref_ids.map(String) : [],
    delegation_dimensions: req.body && typeof req.body.delegation_dimensions === 'object'
      ? req.body.delegation_dimensions
      : {},
    inspectionAnswers: {},
    state: 'NEW',
    updatedAt: nowIso()
  };

  transition(ticket, 'TRIAGE_PENDING');
  transition(ticket, 'TRIAGE_DONE');

  tickets.set(ticketId, ticket);
  return res.status(201).json({ ticketId });
});

app.post('/v1/eligibility/evaluate', (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : null;
  if (!payload) {
    return res.status(400).json(toError('BAD_REQUEST', 'ticket payload is required'));
  }

  const { title, requester } = payload;

  if (!title || !requester) {
    return res.status(400).json(toError('BAD_REQUEST', 'title and requester are required'));
  }

  return res.status(200).json(evaluateEligibilityContract(payload));
});

app.get('/v1/ingestion/status', (_req, res) => {
  return res.status(200).json({
    webhookEnabled: platformWebhookEnabled,
    pollingEnabled: platformPollingEnabled,
    pollIntervalMs: platformPollIntervalMs,
    lastPollAt: lastPlatformPollAt,
    ingestedCount: totalIngestedFromPolling,
    activeConnectionCount: resolvePollingConnections().length
  });
});

app.get('/v1/platform/tickets/:platformTicketId', (req, res) => {
  const localTicketId = platformTicketMap.get(req.params.platformTicketId);
  if (!localTicketId) {
    return res.status(404).json(toError('NOT_FOUND', 'platform ticket not ingested'));
  }

  const localTicket = tickets.get(localTicketId);
  if (!localTicket) {
    return res.status(404).json(toError('NOT_FOUND', 'local ticket not found'));
  }

  return res.status(200).json({
    platformTicketId: req.params.platformTicketId,
    platform: localTicket.sourcePlatform,
    ticketId: localTicketId,
    state: localTicket.state,
    updatedAt: localTicket.updatedAt
  });
});

app.get('/v1/tickets/:ticketId/eligibility', (req, res) => {
  const ticket = getTicket(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json(toError('NOT_FOUND', 'ticket not found'));
  }

  const contract = evaluateEligibilityContract(ticket);
  const decision = contract.is_ai_processable
    ? (contract.requires_inspection ? 'requires_inspection' : 'ai_processable')
    : 'not_processable';

  return res.status(200).json({
    decision,
    reasonCodes: contract.reason_codes
  });
});

app.post('/v1/tickets/:ticketId/inspection/answers', (req, res) => {
  const ticket = getTicket(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json(toError('NOT_FOUND', 'ticket not found'));
  }

  const answers = req.body && typeof req.body.answers === 'object' ? req.body.answers : null;
  if (!answers) {
    return res.status(400).json(toError('BAD_REQUEST', 'answers object is required'));
  }

  ticket.inspectionAnswers = { ...ticket.inspectionAnswers, ...answers };
  transition(ticket, 'INSPECTION_APPROVAL');

  return res.status(200).json({ accepted: true });
});

const runExternalActions = async (ticket) => {
  if (ticket.grant_ref_ids.some((id) => id.includes('confluence'))) {
    await runExternalRequest('GET', '/confluence/wiki/api/v2/pages/123');
  }

  if (ticket.grant_ref_ids.some((id) => id.includes('gitlab'))) {
    await runExternalRequest('POST', '/gitlab/api/v4/projects/42/merge_requests', {
      title: 'AI-generated MR',
      source_branch: 'feature/ai-change',
      target_branch: 'main'
    });
  }

  if (ticket.grant_ref_ids.some((id) => id.includes('figma'))) {
    await runExternalRequest('GET', '/figma/v1/files/abc123');
  }
};

app.post('/v1/tickets/:ticketId/execute', async (req, res) => {
  const ticket = getTicket(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json(toError('NOT_FOUND', 'ticket not found'));
  }

  if (!Array.isArray(ticket.grant_ref_ids) || ticket.grant_ref_ids.length === 0) {
    transition(ticket, 'ESCALATED');
    return res.status(403).json(toError('MISSING_GRANT_REFS', 'grant_ref_ids is required for execution'));
  }

  transition(ticket, 'READY_TO_ASSIGN');
  transition(ticket, 'QUEUED');
  transition(ticket, 'RUNNING');

  try {
    await runExternalActions(ticket);
    transition(ticket, 'DONE');
    return res.status(202).json({ accepted: true, executionId: makeExecutionId() });
  } catch (_error) {
    transition(ticket, 'ESCALATED');
    return res.status(403).json(toError('EXECUTION_BLOCKED', 'external dependency call failed'));
  }
});

app.get('/v1/tickets/:ticketId/status', (req, res) => {
  const ticket = getTicket(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json(toError('NOT_FOUND', 'ticket not found'));
  }

  return res.status(200).json({
    state: ticket.state,
    updatedAt: ticket.updatedAt
  });
});

app.listen(port, () => {
  seedDefaultConnections();

  if (platformPollingEnabled && !platformWebhookEnabled) {
    setInterval(() => {
      void pollUpdatedTicketsFromPlatform();
    }, platformPollIntervalMs);

    void pollUpdatedTicketsFromPlatform();
  }

  console.log(`workforce-sut listening on port ${port}`);
});

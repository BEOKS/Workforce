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
const platformPollingEnabled = String(process.env.PLATFORM_POLLING_ENABLED || 'true') === 'true';
const platformWebhookEnabled = String(process.env.PLATFORM_WEBHOOK_ENABLED || 'false') === 'true';
const platformPollIntervalMs = Number(process.env.PLATFORM_POLL_INTERVAL_MS || 2000);

const tickets = new Map();
const platformTicketMap = new Map();

let lastPlatformPollAt = null;
let totalIngestedFromPolling = 0;
let pollInFlight = false;

const nowIso = () => new Date().toISOString();
const makeId = () => `t_${crypto.randomUUID()}`;
const makeExecutionId = () => `e_${crypto.randomUUID()}`;

const getTicket = (ticketId) => tickets.get(ticketId);

const toError = (code, message) => ({ code, message });

const decideEligibility = (ticket) => {
  const description = String(ticket.description || '').trim();
  const title = String(ticket.title || '').toLowerCase();

  if (title.includes('privileged') && ticket.grant_ref_ids.length === 0) {
    return { decision: 'not_processable', reasonCodes: ['HARD_POLICY_BLOCK'] };
  }

  if (!description) {
    return { decision: 'requires_inspection', reasonCodes: ['INSUFFICIENT_INPUT'] };
  }

  return { decision: 'ai_processable', reasonCodes: [] };
};

const transition = (ticket, nextState) => {
  ticket.state = nextState;
  ticket.updatedAt = nowIso();
};

const normalizePolledTicket = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sourceTicketId = payload.ticketId ?? payload.id;
  if (!sourceTicketId) {
    return null;
  }

  return {
    sourceTicketId: String(sourceTicketId),
    title: String(payload.title || 'Untitled platform ticket'),
    description: String(payload.description || ''),
    requester: String(payload.requester || 'platform'),
    labels: Array.isArray(payload.labels) ? payload.labels.map(String) : [],
    grant_ref_ids: Array.isArray(payload.grant_ref_ids) ? payload.grant_ref_ids.map(String) : []
  };
};

const ingestPolledTicket = (ticketFromPlatform) => {
  if (platformTicketMap.has(ticketFromPlatform.sourceTicketId)) {
    return;
  }

  const ticketId = makeId();
  const ticket = {
    id: ticketId,
    sourcePlatformTicketId: ticketFromPlatform.sourceTicketId,
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

const pollUpdatedTicketsFromPlatform = async () => {
  if (!platformPollingEnabled || platformWebhookEnabled || pollInFlight) {
    return;
  }

  pollInFlight = true;
  lastPlatformPollAt = nowIso();

  try {
    const response = await axios.get(`${pollingPlatformBaseUrl}${platformUpdatedTicketsPath}`, {
      timeout: 7000,
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      return;
    }

    if (!Array.isArray(response.data)) {
      return;
    }

    for (const raw of response.data) {
      const normalized = normalizePolledTicket(raw);
      if (!normalized) {
        continue;
      }
      ingestPolledTicket(normalized);
    }
  } catch (_error) {
    // polling failures are tolerated and retried on next tick
  } finally {
    pollInFlight = false;
  }
};

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
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
    inspectionAnswers: {},
    state: 'NEW',
    updatedAt: nowIso()
  };

  transition(ticket, 'TRIAGE_PENDING');
  transition(ticket, 'TRIAGE_DONE');

  tickets.set(ticketId, ticket);
  return res.status(201).json({ ticketId });
});

app.get('/v1/ingestion/status', (_req, res) => {
  return res.status(200).json({
    webhookEnabled: platformWebhookEnabled,
    pollingEnabled: platformPollingEnabled,
    pollIntervalMs: platformPollIntervalMs,
    lastPollAt: lastPlatformPollAt,
    ingestedCount: totalIngestedFromPolling
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

  const result = decideEligibility(ticket);
  return res.status(200).json(result);
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
  const timeout = 7000;

  if (ticket.grant_ref_ids.some((id) => id.includes('confluence'))) {
    await axios.get(`${mockBaseUrl}/confluence/wiki/api/v2/pages/123`, { timeout });
  }

  if (ticket.grant_ref_ids.some((id) => id.includes('gitlab'))) {
    await axios.post(
      `${mockBaseUrl}/gitlab/api/v4/projects/42/merge_requests`,
      {
        title: 'AI-generated MR',
        source_branch: 'feature/ai-change',
        target_branch: 'main'
      },
      { timeout }
    );
  }

  if (ticket.grant_ref_ids.some((id) => id.includes('figma'))) {
    await axios.get(`${mockBaseUrl}/figma/v1/files/abc123`, { timeout });
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
  } catch (error) {
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
  if (platformPollingEnabled && !platformWebhookEnabled) {
    setInterval(() => {
      void pollUpdatedTicketsFromPlatform();
    }, platformPollIntervalMs);
    void pollUpdatedTicketsFromPlatform();
  }

  console.log(`workforce-sut listening on port ${port}`);
});

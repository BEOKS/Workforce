import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

type OpenAPIDocument = {
  paths: Record<string, Record<string, OperationObject>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
};

type OperationObject = {
  operationId?: string;
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};

let cachedDoc: OpenAPIDocument | undefined;
const validatorCache = new Map<string, ValidateFunction>();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const contractPath = path.resolve(__dirname, '../../contract/openapi.yaml');

const loadContract = (): OpenAPIDocument => {
  if (!cachedDoc) {
    const raw = fs.readFileSync(contractPath, 'utf8');
    cachedDoc = YAML.parse(raw) as OpenAPIDocument;
  }

  return cachedDoc;
};

const resolveRef = (doc: OpenAPIDocument, schema: unknown): unknown => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const mapSchema = schema as Record<string, unknown>;
  if (typeof mapSchema.$ref === 'string') {
    const ref = mapSchema.$ref;
    if (!ref.startsWith('#/')) {
      throw new Error(`unsupported external ref: ${ref}`);
    }

    const parts = ref.slice(2).split('/');
    let cursor: unknown = doc;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        throw new Error(`invalid ref: ${ref}`);
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }

    return resolveRef(doc, cursor);
  }

  const resolved: Record<string, unknown> = { ...mapSchema };
  for (const [key, value] of Object.entries(resolved)) {
    if (Array.isArray(value)) {
      resolved[key] = value.map((item) => resolveRef(doc, item));
    } else if (value && typeof value === 'object') {
      resolved[key] = resolveRef(doc, value);
    }
  }

  return resolved;
};

const findOperation = (doc: OpenAPIDocument, operationId: string): OperationObject => {
  for (const methods of Object.values(doc.paths)) {
    for (const operation of Object.values(methods)) {
      if (operation.operationId === operationId) {
        return operation;
      }
    }
  }

  throw new Error(`operationId not found in OpenAPI contract: ${operationId}`);
};

const getResponseSchema = (operation: OperationObject, status: number): unknown => {
  const responses = operation.responses ?? {};
  const statusKey = String(status);
  const response = responses[statusKey] ?? responses.default;

  if (!response) {
    throw new Error(`response schema not found for status ${status}`);
  }

  return response.content?.['application/json']?.schema;
};

export const validateResponseByOperation = (
  operationId: string,
  status: number,
  payload: unknown
): void => {
  const doc = loadContract();
  const operation = findOperation(doc, operationId);
  const schema = getResponseSchema(operation, status);

  if (!schema) {
    return;
  }

  const resolvedSchema = resolveRef(doc, schema);
  const cacheKey = `${operationId}:${status}`;

  let validator = validatorCache.get(cacheKey);
  if (!validator) {
    validator = ajv.compile(resolvedSchema as object);
    validatorCache.set(cacheKey, validator);
  }

  const valid = validator(payload);
  assert.ok(valid, `OpenAPI validation failed: ${JSON.stringify(validator.errors, null, 2)}`);
};

import assert from 'node:assert';

export const assertStatus = (actual: number, expected: number): void => {
  assert.strictEqual(actual, expected, `expected HTTP status ${expected}, got ${actual}`);
};

export const getField = (payload: unknown, fieldPath: string): unknown => {
  const parts = fieldPath.split('.').filter(Boolean);
  let current: unknown = payload;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    if (Array.isArray(current)) {
      const idx = Number(part);
      current = Number.isInteger(idx) ? current[idx] : undefined;
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
};

export const assertFieldEquals = (payload: unknown, fieldPath: string, expected: string): void => {
  const actual = getField(payload, fieldPath);
  assert.strictEqual(String(actual), expected, `expected field ${fieldPath} to equal ${expected}, got ${String(actual)}`);
};

export const assertFieldOneOf = (payload: unknown, fieldPath: string, expectedValues: string[]): void => {
  const actual = String(getField(payload, fieldPath));
  assert.ok(
    expectedValues.includes(actual),
    `expected field ${fieldPath} to be one of [${expectedValues.join(', ')}], got ${actual}`
  );
};

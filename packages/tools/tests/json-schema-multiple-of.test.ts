import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jsonTool } from '../src/json.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

let sandbox: Sandbox;
beforeEach(async () => {
  sandbox = await mkSandbox();
});
afterEach(async () => {
  await sandbox.cleanup();
});

async function validate(value: unknown, schema: Record<string, unknown>) {
  return jsonTool.execute(
    { action: 'validate', data: JSON.stringify(value), schema },
    sandbox.ctx,
    { signal: new AbortController().signal },
  );
}

describe('JSON Schema multipleOf enforces exact divisibility', () => {
  it.each([
    [1e-10, 1],
    [1.0000000001, 1],
    [5e-7, 1000],
    [2.000000001, 2],
  ])('rejects %s, which leaves a remainder when divided by %s', async (value, step) => {
    const result = await validate(value, { type: 'number', multipleOf: step });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([`$: not a multiple of ${step}`]);
  });

  it.each([
    [0, 7],
    [2, 1],
    [-6, 3],
    [0.3, 0.1],
    [0.7, 0.1],
    [1.1, 0.1],
    [19.99, 0.01],
    [4.35, 0.05],
  ])('accepts %s as a multiple of %s despite binary rounding', async (value, step) => {
    const result = await validate(value, { type: 'number', multipleOf: step });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('still rejects an ordinary non-multiple', async () => {
    const result = await validate(0.25, { type: 'number', multipleOf: 0.1 });
    expect(result.valid).toBe(false);
  });
});

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

const tuple = { type: 'array', items: [{ type: 'string' }, { type: 'number' }] };

describe('JSON Schema tuple items honour additionalItems', () => {
  it('rejects items past the tuple when additionalItems is false', async () => {
    const result = await validate(['a', 1, true, 'x'], { ...tuple, additionalItems: false });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      '$[2]: unexpected additional item',
      '$[3]: unexpected additional item',
    ]);
  });

  it('checks items past the tuple against an additionalItems schema', async () => {
    const result = await validate(['a', 1, 'ok', 2], {
      ...tuple,
      additionalItems: { type: 'string' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['$[3]: expected string, got number']);
    expect(
      (await validate(['a', 1, 'ok', 'fine'], { ...tuple, additionalItems: { type: 'string' } }))
        .valid,
    ).toBe(true);
  });

  it('accepts an array no longer than the tuple even when additionalItems is false', async () => {
    expect((await validate(['a', 1], { ...tuple, additionalItems: false })).valid).toBe(true);
    expect((await validate(['a'], { ...tuple, additionalItems: false })).valid).toBe(true);
  });

  it('leaves extra items unconstrained when additionalItems is absent or true', async () => {
    expect((await validate(['a', 1, true], tuple)).valid).toBe(true);
    expect((await validate(['a', 1, true], { ...tuple, additionalItems: true })).valid).toBe(true);
  });

  it('ignores additionalItems when items is a single schema', async () => {
    const schema = { type: 'array', items: { type: 'string' }, additionalItems: false };
    expect((await validate(['a', 'b', 'c'], schema)).valid).toBe(true);
  });
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wrongstack/tools', () => ({
  getProcessRegistry: () => ({ killAll: vi.fn() }),
}));

import { runSingleShotDispatch } from '../src/boot/dispatch-singleshot.js';
import {
  checkStructuredAnswer,
  repairPrompt,
  resolveJsonSchemaFlag,
  withSchemaInstruction,
} from '../src/boot/structured-output.js';

const schema = {
  type: 'object',
  properties: { count: { type: 'number' } },
  required: ['count'],
} as const;

describe('checkStructuredAnswer', () => {
  it('accepts a bare or fenced JSON answer that validates', () => {
    expect(checkStructuredAnswer('{"count":2}', schema as never)).toEqual({
      ok: true,
      value: { count: 2 },
    });
    expect(checkStructuredAnswer('```json\n{"count":3}\n```', schema as never)).toEqual({
      ok: true,
      value: { count: 3 },
    });
  });

  it('reports parse and validation failures with a path', () => {
    expect(checkStructuredAnswer('', schema as never)).toEqual({
      ok: false,
      errors: ['the answer was empty'],
    });
    const notJson = checkStructuredAnswer('two', schema as never);
    expect(notJson.ok).toBe(false);
    const wrong = checkStructuredAnswer('{"count":"2"}', schema as never);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors.join(' ')).toMatch(/count/);
  });
});

describe('prompts', () => {
  it('keeps the task first and embeds the schema', () => {
    const text = withSchemaInstruction('count files', schema as never);
    expect(text.startsWith('count files')).toBe(true);
    expect(text).toContain(JSON.stringify(schema));
  });

  it('lists every error in the repair turn', () => {
    expect(repairPrompt(['a: bad', 'b: worse'])).toContain('- a: bad\n- b: worse');
  });
});

describe('resolveJsonSchemaFlag', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-schema-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reads inline JSON and files, and rejects the unusable', async () => {
    expect(await resolveJsonSchemaFlag(undefined, tmp)).toBeUndefined();
    expect(await resolveJsonSchemaFlag('{"type":"object"}', tmp)).toEqual({ type: 'object' });
    await fs.writeFile(path.join(tmp, 's.json'), JSON.stringify(schema));
    expect(await resolveJsonSchemaFlag('s.json', tmp)).toEqual(schema);
    await expect(resolveJsonSchemaFlag(true, tmp)).rejects.toThrow(/needs a JSON Schema/);
    await expect(resolveJsonSchemaFlag('missing.json', tmp)).rejects.toThrow(/ENOENT/);
    await expect(resolveJsonSchemaFlag('{bad', tmp)).rejects.toThrow(/not valid JSON/);
    await expect(resolveJsonSchemaFlag('[1]', tmp)).rejects.toThrow(/cannot read/);
  });
});

describe('single-shot --json-schema', () => {
  const tokenCounter = {
    total: () => ({ input: 0, output: 0 }),
    estimateCost: () => ({ input: 0, output: 0, total: 0, currency: 'USD' }),
  };
  const renderer = () => ({
    write: vi.fn(),
    writeError: vi.fn(),
    writeWarning: vi.fn(),
    writeDelegateSummaries: vi.fn(),
  });
  const done = (finalText: string) => ({ status: 'done', finalText, iterations: 1, messages: [] });

  it('repairs once, then reports the structured value', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(done('about two'))
      .mockResolvedValueOnce(done('{"count":2}'));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runSingleShotDispatch({
        agent: { run } as never,
        query: 'count',
        flags: { 'output-json': true, 'json-schema': JSON.stringify(schema) },
        tokenCounter: tokenCounter as never,
        renderer: renderer() as never,
      });
      expect(code).toBe(0);
      expect(run).toHaveBeenCalledTimes(2);
      expect(String(run.mock.calls[1]?.[0])).toContain('did not validate');
      const payload = JSON.parse(String(stdout.mock.calls.at(-1)?.[0]));
      expect(payload).toMatchObject({
        structuredOutput: { count: 2 },
        schemaErrors: null,
        usage: { iterations: 2 },
      });
    } finally {
      stdout.mockRestore();
    }
  });

  it('fails with exit 1 after one unsuccessful repair', async () => {
    const run = vi.fn().mockResolvedValue(done('still prose'));
    const r = renderer();
    const code = await runSingleShotDispatch({
      agent: { run } as never,
      query: 'count',
      flags: { 'json-schema': JSON.stringify(schema) },
      tokenCounter: tokenCounter as never,
      renderer: r as never,
    });
    expect(code).toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.writeError).toHaveBeenCalledWith(
      expect.stringContaining('Answer did not match --json-schema'),
    );
  });
});

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripAnsi } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlashCommandContext } from '../src/slash-commands/index.js';
import { executeSettingsSubcommand } from '../src/slash-commands/settings-mutations.js';

let dir: string;
let globalConfig: string;
let inProjectConfig: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wstack-settings-limits-'));
  globalConfig = path.join(dir, 'global', 'config.json');
  inProjectConfig = path.join(dir, 'project', 'config.json');
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await import('node:fs/promises').then((fsp) =>
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {}),
  );
});

function makeCtx(config: Record<string, unknown> = {}) {
  const store = { get: vi.fn(() => config), update: vi.fn() };
  const ctx = {
    configStore: store,
    paths: { globalConfig, profileConfig: () => globalConfig, inProjectConfig },
    vault: {
      encrypt: (value: string) => `enc:test:${value}`,
      decrypt: (value: string) => value.replace(/^enc:test:/, ''),
      isEncrypted: (value: string) => value.startsWith('enc:test:'),
      keyVersion: 1,
    },
  } as never as SlashCommandContext;
  return { ctx, store };
}

async function run(args: string, ctx: SlashCommandContext): Promise<string> {
  const result = await executeSettingsSubcommand('limits', args ? args.split(' ') : [], ctx);
  return stripAnsi(result?.message ?? '');
}

function writtenLimits(): unknown {
  return JSON.parse(readFileSync(globalConfig, 'utf8')).limits;
}

describe('/settings limits', () => {
  it('lists every limit as unset (= no limit) when none is configured', async () => {
    const { ctx } = makeCtx();
    const out = await run('', ctx);
    expect(out).toContain('response-output-tokens');
    expect(out).toContain('subagent-timeout-ms');
    // One row per limit (7 scalars + 3 budget fields), every one unset.
    expect(out.match(/ unset {3}/g)).toHaveLength(10);
  });

  it('sets a scalar limit in the profile config and the live store', async () => {
    const { ctx, store } = makeCtx();
    const out = await run('response-output-tokens 16000', ctx);
    expect(out).toContain('response-output-tokens → 16000');
    expect(writtenLimits()).toEqual({ responseOutputTokens: 16000 });
    expect(store.update).toHaveBeenCalledWith(
      expect.objectContaining({ limits: { responseOutputTokens: 16000 } }),
    );
  });

  it('sets a default subagent budget field under subagentDefaultBudget', async () => {
    const { ctx } = makeCtx();
    await run('subagent-max-iterations 40', ctx);
    expect(writtenLimits()).toEqual({ subagentDefaultBudget: { maxIterations: 40 } });
  });

  it('clears with "off" and still writes the block, so the shallow store merge drops it', async () => {
    const { ctx, store } = makeCtx();
    await run('history-messages 400', ctx);
    await run('history-messages off', ctx);
    expect(writtenLimits()).toEqual({});
    expect(store.update).toHaveBeenLastCalledWith(expect.objectContaining({ limits: {} }));
  });

  it.each(['0', '-5', '1.5', 'lots'])('rejects %s without writing', async (value) => {
    const { ctx } = makeCtx();
    const out = await run(`fetch-bytes ${value}`, ctx);
    expect(out).toContain('Invalid value');
    expect(() => readFileSync(globalConfig, 'utf8')).toThrow();
  });

  it.each([
    ['history-messages 5', 'must be ≥ 20 messages'],
    ['fetch-bytes 999999999999', 'must be 1,024 – 67,108,864 bytes'],
    ['subagent-timeout-ms 500', 'must be 10,000 – 2,147,483,647 ms'],
  ])('refuses out-of-range %s and names the range', async (args, range) => {
    const { ctx } = makeCtx();
    const out = await run(args, ctx);
    expect(out).toContain('Invalid value');
    expect(out).toContain(range);
    expect(() => readFileSync(globalConfig, 'utf8')).toThrow();
  });

  it('shows each range, and flags a hand-edited value outside it', async () => {
    const { ctx } = makeCtx({ limits: { historyMessages: 3 } });
    const out = await run('', ctx);
    expect(out).toContain('≥ 20 messages');
    expect(out).toContain('1,024 – 67,108,864 bytes');
    expect(out).toContain('out of range, applied as 20');
  });

  it('names the known limits for an unknown one', async () => {
    const { ctx } = makeCtx();
    const out = await run('max-everything 5', ctx);
    expect(out).toContain('Unknown limit');
    expect(out).toContain('tool-output-preview-bytes');
  });
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTierCommand } from '../src/slash-commands/tier.js';

interface TiersRecord {
  enabled?: boolean;
  default?: string;
  levels?: Record<string, Record<string, unknown>>;
  routing?: Record<string, string>;
  leader?: Record<string, unknown>;
}

/**
 * `/tier remove` must not leave dangling references to the deleted level, and
 * numeric arguments must be parsed strictly (no trailing junk, no truncation).
 */
describe('tier command — remove cleanup and strict numeric parsing', () => {
  let dir: string;
  let cfg: Record<string, unknown>;
  let configPath: string;

  const tiers = (): TiersRecord => (cfg['modelTiers'] as TiersRecord | undefined) ?? {};

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-tier-rm-'));
    configPath = path.join(dir, 'default.config.json');
    cfg = {
      provider: 'p',
      model: 'm',
      activeProfile: 'default',
      fallbackProfiles: {},
      modelTiers: {
        enabled: true,
        default: 'premium',
        levels: { budget: { maxCostUsd: 0.1 }, premium: { maxCostUsd: 2 } },
        routing: { '*': 'premium', reviewer: 'budget' },
        leader: { mode: 'auto', maxTier: 'premium', dwellTurns: 2 },
      },
    };
    // The command patches the on-disk profile config, so seed it with the same
    // state the in-memory store reports.
    await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function command(): ReturnType<typeof buildTierCommand> {
    const ctx = {
      configStore: {
        get: () => cfg,
        update: (patch: Record<string, unknown>) => {
          Object.assign(cfg, patch);
        },
      },
      paths: { profileConfig: (name: string) => path.join(dir, `${name}.config.json`) },
    } as unknown as Parameters<typeof buildTierCommand>[0];
    return buildTierCommand(ctx);
  }

  async function run(args: string): Promise<string> {
    const res = (await command().run(args, {} as never)) as { message?: string };
    return res?.message ?? '';
  }

  it('drops routing rules, the default and the leader ceiling that named the removed tier', async () => {
    expect(await run('remove premium')).toContain('removed');
    const t = tiers();
    expect(t.levels).toEqual({ budget: { maxCostUsd: 0.1 } });
    expect(t.routing).toEqual({ reviewer: 'budget' });
    expect(t.default).toBeUndefined();
    expect(t.leader).toEqual({ mode: 'auto', dwellTurns: 2 });
    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8')) as { modelTiers: TiersRecord };
    expect(onDisk.modelTiers.default).toBeUndefined();
    expect(onDisk.modelTiers.leader?.['maxTier']).toBeUndefined();
  });

  it('keeps unrelated default and ceiling when removing another tier (rm alias)', async () => {
    expect(await run('rm budget')).toContain('removed');
    const t = tiers();
    expect(t.routing).toEqual({ '*': 'premium' });
    expect(t.default).toBe('premium');
    expect(t.leader?.['maxTier']).toBe('premium');
  });

  it('tolerates a config with no leader block', async () => {
    delete (cfg['modelTiers'] as TiersRecord).leader;
    await fs.writeFile(configPath, JSON.stringify(cfg, null, 2));
    expect(await run('remove premium')).toContain('removed');
    expect(tiers().leader).toBeUndefined();
  });

  it('refuses to remove an unknown tier and reports usage without an argument', async () => {
    expect(await run('remove nope')).toContain('No such tier');
    expect(await run('remove')).toContain('Usage:');
    expect(tiers().levels).toHaveProperty('premium');
  });

  it.each(['0.25abc', '1e3', '', '-1', 'abc'])('rejects maxCostUsd %j', async (usd) => {
    const args = usd === '' ? 'budget budget' : `budget budget ${usd}`;
    expect(await run(args)).toContain('Invalid');
    expect(tiers().levels?.['budget']).toEqual({ maxCostUsd: 0.1 });
  });

  it.each([
    ['40.5', 'maxIterations'],
    ['40x', 'maxIterations'],
  ])('rejects truncating maxIterations %j', async (iters, field) => {
    expect(await run(`budget budget 0.5 ${iters}`)).toContain(`Invalid ${field}`);
    expect(tiers().levels?.['budget']).toEqual({ maxCostUsd: 0.1 });
  });

  it('rejects a truncating maxToolCalls', async () => {
    expect(await run('budget budget 0.5 10 7.9')).toContain('Invalid maxToolCalls');
  });

  it('accepts leading-dot decimals and zero budgets', async () => {
    expect(await run('budget budget .5 0 0')).toContain('✓');
    expect(tiers().levels?.['budget']).toEqual({
      maxCostUsd: 0.5,
      maxIterations: 0,
      maxToolCalls: 0,
    });
  });

  it('parses leader dwell strictly', async () => {
    expect(await run('leader dwell 3.7')).toContain('Usage:');
    expect(await run('leader dwell -1')).toContain('Usage:');
    expect(await run('leader dwell 0')).toContain('leader dwell → 0');
    expect(tiers().leader?.['dwellTurns']).toBe(0);
  });

  it('clears the leader ceiling with none and rejects an unknown ceiling', async () => {
    expect(await run('leader ceiling ghost')).toContain('Unknown tier');
    expect(await run('leader ceiling none')).toContain('none');
    expect(tiers().leader?.['maxTier']).toBeUndefined();
  });
});

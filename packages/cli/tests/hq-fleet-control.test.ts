/**
 * HQ `abort fleet` scoping.
 *
 * The CLI host ignored the command's session and swept every subagent the
 * Director held — in the WebUI host, a Stop aimed at one tab's fleet killed
 * every tab's workers. WebUI tabs had no fleet hooks at all.
 */
import { FLEET_ROSTER } from '@wrongstack/core/coordination';
import { describe, expect, it, vi } from 'vitest';
import { createHqFleetControl, killHqSessionFleet, spawnHqAgent } from '../src/hq-fleet-control.js';

function fakeDirector(bySession: Record<string, string[]>) {
  const all = Object.values(bySession).flat();
  return {
    subagentIdsForSession: vi.fn((sessionId: string) => bySession[sessionId] ?? []),
    terminateSession: vi.fn(async () => undefined),
    status: () => ({ subagents: all.map((id) => ({ id, status: 'running' })) }),
    remove: vi.fn(async () => undefined),
    terminate: vi.fn(async () => undefined),
    spawn: vi.fn(async () => 'fake-subagent-id'),
  };
}

function capturingDirector() {
  const captured: unknown[] = [];
  return {
    captured,
    spawn: vi.fn(async (cfg: unknown) => {
      captured.push(cfg);
      return 'fake-subagent-id';
    }),
  };
}

describe('killHqSessionFleet', () => {
  it('stops only the named session when it owns workers', async () => {
    const director = fakeDirector({ 'tab-1': ['a', 'b'], 'tab-2': ['c'] });
    const killed = await killHqSessionFleet(director as never, 'tab-1', {
      multiConversation: true,
    });
    expect(killed).toBe(2);
    expect(director.terminateSession).toHaveBeenCalledWith('tab-1');
    expect(director.remove).not.toHaveBeenCalled();
  });

  it('never reaches another conversation when several share the Director', async () => {
    const director = fakeDirector({ 'tab-2': ['c'] });
    const killed = await killHqSessionFleet(director as never, 'tab-1', {
      multiConversation: true,
    });
    expect(killed).toBe(0);
    expect(director.terminateSession).not.toHaveBeenCalled();
    expect(director.remove).not.toHaveBeenCalled();
  });

  it('keeps the process-wide sweep for a single-conversation host', async () => {
    // After /resume the leader's older workers carry the boot session id.
    const director = fakeDirector({ boot: ['x', 'y'] });
    const killed = await killHqSessionFleet(director as never, 'resumed', {
      multiConversation: false,
    });
    expect(killed).toBe(2);
    expect(director.remove).toHaveBeenCalledTimes(2);
  });
});

describe('createHqFleetControl', () => {
  it('binds lazily to a Director that appears after wiring', async () => {
    let director: ReturnType<typeof fakeDirector> | null = null;
    const control = createHqFleetControl(
      () => director as never,
      () => 'boot',
      { multiConversation: true },
    );
    expect(await control.killFleet('tab-1')).toBe(0);
    director = fakeDirector({ 'tab-1': ['a'] });
    expect(await control.killFleet('tab-1')).toBe(1);
    expect(await control.terminateAgent('a')).toBe(true);
  });
});

// Regression: spawnHqAgent silently dropped the caller's `maxIterations` when
// the role was in FLEET_ROSTER. The runtime budget path
// (applyRosterBudget at packages/core/src/coordination/fleet.ts:325) honors
// a non-undefined `cfg.maxIterations`, but the override only reaches it when
// spawnHqAgent forwards the caller's value onto the spawn config.
describe('spawnHqAgent', () => {
  it("forwards the caller's maxIterations onto the spawn config for a known roster role", async () => {
    const director = capturingDirector();
    // 'audit-log' is a real entry in the production FLEET_ROSTER.
    expect(FLEET_ROSTER['audit-log']).toBeDefined();
    await spawnHqAgent(director as never, 'sess-target', 'audit-log', undefined, 10);
    const cfg = director.captured[0] as { maxIterations?: number };
    expect(cfg.maxIterations).toBe(10);
  });

  it("honors the caller's maxIterations for an ad-hoc role", async () => {
    const director = capturingDirector();
    await spawnHqAgent(director as never, 'sess-ctrl', 'ad-hoc-unknown-role-xyz', undefined, 7);
    const cfg = director.captured[0] as { maxIterations?: number };
    expect(cfg.maxIterations).toBe(7);
  });

  it('leaves maxIterations unset for an ad-hoc role spawned without one', async () => {
    // It used to be `maxIterations ?? 0`; the budget takes the raw value first,
    // so a project agent spawned from HQ was stopped after one iteration.
    const director = capturingDirector();
    await spawnHqAgent(director as never, 'sess-ctrl', 'ad-hoc-unknown-role-xyz', 'task');
    const cfg = director.captured[0] as { maxIterations?: number };
    expect(cfg.maxIterations).toBeUndefined();
  });
});

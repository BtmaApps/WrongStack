import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultPermissionPolicy, subagentYoloPlus } from '@wrongstack/core/security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionAgentRegistry } from '../src/server/session-agent-registry.js';

/**
 * Every WebUI tab shares ONE fleet host, so a subagent cannot read "the" YOLO+
 * — it has to read its own tab's. The session registry is how it finds that
 * tab; these tests pin that one tab's YOLO+ never widens another tab's workers.
 */
describe('YOLO+ for subagents follows the tab that spawned them', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yolo-plus-tabs-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function setup() {
    const metas: Record<string, Record<string, unknown>> = {
      'tab-a': { yolo: true, yoloPlus: true },
      'tab-b': { yolo: true, yoloPlus: false },
    };
    const template = { ctx: { session: { id: 'tab-a' }, meta: metas['tab-a'] } } as never;
    const registry = createSessionAgentRegistry({
      template,
      createAgent: (id: string) => ({ ctx: { session: { id }, meta: metas[id] ?? {} } }) as never,
    });
    registry.get('tab-b');
    // The leader policy is process-wide too; per-tab state lives in meta.
    const leaderPolicy = new DefaultPermissionPolicy({
      trustFile: path.join(dir, 'trust.json'),
      yolo: true,
      yoloPlus: true, // the process switch says YOLO+ — a tab's own meta must still win
    });
    const forTab = (sessionId: string | undefined, fallback = false) =>
      subagentYoloPlus({ sessionId, leaderPolicy, fallback: () => fallback });
    return { metas, forTab, registry };
  }

  it('the YOLO+ tab’s workers get it; the other tab’s do not', () => {
    const { forTab } = setup();
    expect(forTab('tab-a')).toBe(true);
    expect(forTab('tab-b')).toBe(false);
  });

  it('a toggle in one tab reaches that tab’s running workers only', () => {
    const { metas, forTab } = setup();
    metas['tab-b']!['yoloPlus'] = true;
    metas['tab-a']!['yoloPlus'] = false;
    expect(forTab('tab-a')).toBe(false);
    expect(forTab('tab-b')).toBe(true);
  });

  it('YOLO off in a tab ends YOLO+ for its workers, whatever its stale flag says', () => {
    const { metas, forTab } = setup();
    metas['tab-a']!['yolo'] = false;
    expect(forTab('tab-a')).toBe(false);
  });

  it('a tab the registry does not know falls back (and never creates one)', () => {
    const { forTab, registry } = setup();
    expect(forTab('tab-unknown', false)).toBe(false);
    expect(registry.has('tab-unknown')).toBe(false);
    expect(forTab('tab-unknown', true)).toBe(true);
    expect(forTab(undefined, false)).toBe(false);
  });
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildLiveNextStepsGateBlock,
  hasLeaderNextStepsPolicy,
} from '../../src/core/next-steps-gate.js';
import { DefaultSystemPromptBuilder } from '../../src/core/system-prompt-builder.js';
import { estimateTextTokens } from '../../src/utils/token-estimate.js';

/**
 * The leader's `<nextsteps>` rules live in the cached system prompt
 * ("After-task suggestions", leader-after-task.md). The per-request gate used
 * to restate ~300 tokens of them on every request — uncached on breakpoint
 * wires, a permanent replayed copy per state change on automatic wires. With
 * the rules in the prompt it carries only the live state and the branch.
 */
describe('compact next-steps gate', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-gate-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('the host prompt carries the leader policy; a subagent prompt does not', async () => {
    const builder = new DefaultSystemPromptBuilder({ todayIso: '2026-10-11' });
    const host = await builder.build({ cwd: tmp, projectRoot: tmp, tools: [] });
    expect(hasLeaderNextStepsPolicy(host)).toBe(true);
    expect(host.map((b) => b.text).join('\n')).toContain('**Optional mode**');

    const sub = await builder.build({ cwd: tmp, projectRoot: tmp, tools: [], subagent: true });
    expect(hasLeaderNextStepsPolicy(sub)).toBe(false);
  });

  it('carries only live state and the selected branch when the prompt has the rules', () => {
    const leader = { agentId: 'leader', todos: [] };
    const full = buildLiveNextStepsGateBlock(leader, 'optional', false);
    const compact = buildLiveNextStepsGateBlock(leader, 'optional', true);
    expect(compact?.text).toContain('open todos = 0');
    expect(compact?.text).toContain('Next-steps mode = optional');
    expect(compact?.text).not.toContain('The recipient is the LLM');
    expect(estimateTextTokens(compact?.text ?? '')).toBeLessThan(
      estimateTextTokens(full?.text ?? '') / 3,
    );

    const required = buildLiveNextStepsGateBlock(leader, 'required', true);
    expect(required?.text).toContain('Next-steps mode = required');
    expect(required?.text).toContain('<nextsteps-complete/>');
  });

  it('keeps the live todo snapshot — that part is state, not policy', () => {
    const leader = {
      agentId: 'leader',
      todos: [{ id: 't1', content: 'write focused tests', status: 'pending' as const }],
    };
    const block = buildLiveNextStepsGateBlock(leader, 'optional', true);
    expect(block?.text).toContain('open todos = 1');
    expect(block?.text).toContain('MUST omit <nextsteps>');
    expect(block?.text).toContain('- [pending] write focused tests');
  });
});

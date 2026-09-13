import { describe, expect, it, vi } from 'vitest';

/**
 * Background delegation results are drained into a conversation only by its
 * LEADER (`isLeaderAgentId`: agentId `leader` or a mailbox leader address).
 * Every WebUI tab runs on an Agent this registry builds; if those contexts
 * carried any other agentId, the drain would silently never run for WebUI
 * leaders and results would pile up in the hub — the bug the ACP agent had.
 */

const contextOptions: Array<Record<string, unknown>> = [];

vi.mock('@wrongstack/core/agent', () => {
  class Context {
    meta: Record<string, unknown> = {};
    session: unknown;
    agentId: unknown;
    constructor(opts: Record<string, unknown>) {
      contextOptions.push(opts);
      this.session = opts['session'];
      this.agentId = opts['agentId'];
    }
  }
  class Agent {
    ctx: unknown;
    constructor(opts: Record<string, unknown>) {
      this.ctx = opts['context'];
    }
  }
  return { Agent, Context };
});

vi.mock('@wrongstack/core/infrastructure', () => ({
  DefaultTokenCounter: class {
    total() {
      return { input: 0, output: 0 };
    }
  },
}));

const { createSessionAgentRegistry } = await import('../src/server/session-agent-registry.js');
const { isLeaderAgentId } = await import('../../core/src/leader-delivery-attach.js');

describe('WebUI per-tab agents are leaders', () => {
  it('builds every tab context with agentId `leader`, which the delivery drain accepts', () => {
    const template = {
      ctx: {
        projectRoot: '/repo',
        cwd: '/repo',
        model: 'm',
        provider: { id: 'p' },
        session: { id: 'sess_boot' },
        traceId: 't',
        systemPrompt: '',
        meta: {},
        tokenCounter: {
          total: () => ({ input: 0, output: 0 }),
          estimateCost: () => ({ total: 0 }),
        },
        tools: [],
      },
    };
    const registry = createSessionAgentRegistry({ template: template as never });

    const agent = registry.get('sess_tab_2');

    expect(contextOptions.at(-1)?.['agentId']).toBe('leader');
    expect((agent.ctx as { agentId?: unknown }).agentId).toBe('leader');
    expect(isLeaderAgentId((agent.ctx as { agentId?: unknown }).agentId)).toBe(true);
  });
});

import type { Tool } from '@wrongstack/contracts/types/tool';
import type { Agent } from '@wrongstack/core/agent';
import { ToolRegistry } from '@wrongstack/core/registry';
import { describe, expect, it } from 'vitest';
import {
  createSessionAgentRegistry,
  newSessionMetaFromConfig,
} from '../src/server/session-agent-registry.js';

/**
 * A new tab — and the session `/clear` opens — starts on the identity the user
 * picked last (the live config), with that identity's tool surface. The leader's
 * copy of the key is dropped on purpose, and nothing used to seed it back, so
 * the new session composed the boot identity and sent the whole tier surface.
 */

const tool = (name: string): Tool => ({
  name,
  description: name,
  inputSchema: { type: 'object' },
  permission: 'auto',
  mutating: false,
  async execute() {
    return '';
  },
});

function registryWith(names: string[]): ToolRegistry {
  const r = new ToolRegistry();
  for (const name of names) r.register(tool(name));
  return r;
}

describe('session agent registry identity seed', () => {
  it('seeds a new session with the live variant and its tool surface', () => {
    const tools = registryWith([
      'read',
      'write',
      'bash',
      'kanban',
      'git',
      'tool_search',
      'tool_use',
    ]);
    const template = { ctx: { session: { id: 'sess_boot' }, meta: {} } } as unknown as Agent;
    let config = { systemPrompt: { variant: 'default' as const } } as {
      systemPrompt: { variant: 'default' | 'quick' };
    };
    const sessionAgents = createSessionAgentRegistry({
      template,
      createAgent: () => ({ ctx: { meta: {}, tools: tools.list() }, tools }) as unknown as Agent,
      newSessionMeta: () => newSessionMetaFromConfig(config),
    });

    // The user picks Quick; the pick moves the live config.
    config = { systemPrompt: { variant: 'quick' } };
    const fresh = sessionAgents.get('sess_new');

    expect(fresh.ctx.meta['systemPromptVariant']).toBe('quick');
    expect(fresh.ctx.tools.map((t) => t.name)).toEqual([
      'read',
      'write',
      'bash',
      'tool_search',
      'tool_use',
    ]);
  });

  it('never overwrites a value the session already carries', () => {
    const tools = registryWith(['read']);
    const template = { ctx: { session: { id: 'sess_boot' }, meta: {} } } as unknown as Agent;
    const sessionAgents = createSessionAgentRegistry({
      template,
      createAgent: () =>
        ({ ctx: { meta: { systemPromptVariant: 'pro' }, tools: [] }, tools }) as unknown as Agent,
      newSessionMeta: () => ({ systemPromptVariant: 'quick' }),
    });
    expect(sessionAgents.get('sess_other').ctx.meta['systemPromptVariant']).toBe('pro');
  });

  it('seeds nothing when the config names no variant', () => {
    expect(newSessionMetaFromConfig(undefined)).toEqual({});
    expect(newSessionMetaFromConfig({ systemPrompt: {} } as never)).toEqual({});
  });
});

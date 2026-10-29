import type { Tool } from '@wrongstack/contracts/types/tool';
import { describe, expect, it } from 'vitest';
import {
  isToolReachable,
  reachableTools,
  reachesCatalog,
} from '../../src/registry/session-tool-reach.js';

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
const names = (tools: readonly Tool[]) => tools.map((t) => t.name);
const catalog = ['read', 'bash', 'git', 'delegate', 'tool_search', 'tool_use'].map(tool);

describe('session tool reach', () => {
  it('a fixed surface without tool_use reaches exactly that surface (Quick)', () => {
    const ctx = { tools: [tool('read'), tool('bash')], catalogTools: catalog };
    expect(reachesCatalog(ctx)).toBe(false);
    expect(names(reachableTools(ctx))).toEqual(['read', 'bash']);
    expect(isToolReachable(ctx, 'read')).toBe(true);
    expect(isToolReachable(ctx, 'git')).toBe(false);
    expect(isToolReachable(ctx, 'delegate')).toBe(false);
  });

  it('a surface carrying tool_use reaches the whole catalog (Scout, tiers)', () => {
    const ctx = {
      tools: [tool('read'), tool('tool_search'), tool('tool_use')],
      catalogTools: catalog,
    };
    expect(reachesCatalog(ctx)).toBe(true);
    expect(names(reachableTools(ctx))).toEqual(names(catalog));
    expect(isToolReachable(ctx, 'git')).toBe(true);
  });

  it('a context with no declared surface is unrestricted', () => {
    const ctx = { tools: [], catalogTools: catalog };
    expect(reachesCatalog(ctx)).toBe(true);
    expect(isToolReachable(ctx, 'git')).toBe(true);
  });
});

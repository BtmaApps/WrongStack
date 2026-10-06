import { kanbanTool } from '@wrongstack/tools/kanban';
import { describe, expect, it } from 'vitest';
import {
  KANBAN_DESTRUCTIVE_ACTIONS,
  KANBAN_MANAGE_ACTIONS,
  KANBAN_READ_ACTIONS,
  KANBAN_TOOL_ANNOTATIONS,
  selectKanbanMcpTools,
} from '../src/policy.js';

function schemaActions(): string[] {
  const schema = kanbanTool.inputSchema as unknown as {
    properties?: { action?: { enum?: string[] } };
  };
  return schema.properties?.action?.enum ?? [];
}

describe('Kanban MCP policy', () => {
  it('classifies every public Kanban tool action exactly once', () => {
    const classified = [
      ...KANBAN_READ_ACTIONS,
      ...KANBAN_MANAGE_ACTIONS,
      ...KANBAN_DESTRUCTIVE_ACTIONS,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect([...classified].sort()).toEqual([...schemaActions()].sort());
  });

  it('is read-only with live watch by default', () => {
    expect(selectKanbanMcpTools().map((tool) => tool.name)).toEqual([
      'kanban_read',
      'kanban_watch',
    ]);
  });

  it('adds management without destructive operations for writable mode', () => {
    expect(selectKanbanMcpTools({ writable: true }).map((tool) => tool.name)).toEqual([
      'kanban_read',
      'kanban_watch',
      'kanban_manage',
    ]);
  });

  it('makes destructive mode a superset of writable mode', () => {
    expect(selectKanbanMcpTools({ destructive: true }).map((tool) => tool.name)).toEqual([
      'kanban_read',
      'kanban_watch',
      'kanban_manage',
      'kanban_destructive',
    ]);
  });
});

describe('Kanban MCP tool annotations', () => {
  it('marks both always-on observation tools read-only and closed-world', () => {
    expect(KANBAN_TOOL_ANNOTATIONS.kanban_read).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(KANBAN_TOOL_ANNOTATIONS.kanban_watch).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  it('separates mutation from destruction across the writable tiers', () => {
    expect(KANBAN_TOOL_ANNOTATIONS.kanban_manage).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(KANBAN_TOOL_ANNOTATIONS.kanban_destructive).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });
  });

  it('claims idempotency for no tier', () => {
    // Manage actions are generative (retrying add_task duplicates the card),
    // destructive deletes of a missing id throw NOT_FOUND, and merge/transfer
    // move state between boards — none is honestly idempotent, so the hint
    // stays unset and the spec default (false) speaks.
    for (const [name, annotations] of Object.entries(KANBAN_TOOL_ANNOTATIONS)) {
      expect(annotations.idempotentHint, name).toBeUndefined();
    }
  });

  it('annotates every tool any tier selection can publish', () => {
    for (const opts of [
      {},
      { writable: true },
      { destructive: true },
      { writable: true, destructive: true },
    ]) {
      for (const tool of selectKanbanMcpTools(opts)) {
        expect(
          KANBAN_TOOL_ANNOTATIONS[tool.name],
          `${JSON.stringify(opts)} ${tool.name}`,
        ).toBeDefined();
      }
    }
  });
});

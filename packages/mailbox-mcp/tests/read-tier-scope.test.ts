/**
 * The MCP read tiers.
 *
 * `mailbox_read` exposes the same actions on every tier — the tier flags add
 * WRITE operations, they do not widen what a read may reach. Only the
 * explicit full-access tier (`--admin`) keeps project-wide reads; every other
 * tier binds its reads to the configured `--actor` through the shared
 * actor-scoped projection (see `actor-scoped-read.test.ts` for the behaviour
 * this contract produces).
 */
import { describe, expect, it } from 'vitest';
import { hasFullMailboxAccess, selectMailboxMcpTools } from '../src/policy.js';

function readActions(opts?: Parameters<typeof selectMailboxMcpTools>[0]) {
  return selectMailboxMcpTools(opts).find((tool) => tool.name === 'mailbox_read')?.actions;
}

describe('Mailbox MCP read tiers', () => {
  it('binds reads to the configured actor on every tier but the explicit full-access one', () => {
    expect(hasFullMailboxAccess()).toBe(false);
    expect(hasFullMailboxAccess({ writable: true })).toBe(false);
    expect(hasFullMailboxAccess({ admin: true })).toBe(true);
  });

  it('keeps the read actions identical across tiers', () => {
    expect(readActions({ writable: true })).toEqual(readActions());
    expect(readActions({ admin: true })).toEqual(readActions());
  });
});

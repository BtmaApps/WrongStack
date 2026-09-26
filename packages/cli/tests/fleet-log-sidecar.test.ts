import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFleetCommandHandlers } from '../src/wiring/fleet-command-handlers.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const EVENTS = [
  JSON.stringify({ type: 'user_input', content: 'fix the leak' }),
  JSON.stringify({ type: 'tool_use', name: 'grep' }),
  JSON.stringify({ type: 'llm_response', content: 'done' }),
].join('\n');

/**
 * A director run directory as the session factory leaves it: subagent journals
 * named `<subagentId>.jsonl` PLUS the DefaultSessionStore's own `_index.jsonl`
 * (written on create) and, when wired, per-session sidecars.
 */
async function makeHandlers(withSidecars: boolean) {
  const fleetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-fleet-sidecar-'));
  roots.push(fleetRoot);
  const runDir = path.join(fleetRoot, 'subagents', 'run-1');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'agent-1.jsonl'), `${EVENTS}\n`);
  if (withSidecars) {
    await fs.writeFile(
      path.join(runDir, '_index.jsonl'),
      `${JSON.stringify({ id: 'agent-1', title: 'agent-1', tokenTotal: 0 })}\n`,
    );
    await fs.writeFile(
      path.join(runDir, 'agent-1.replay.jsonl'),
      `${JSON.stringify({ hash: 'h', ts: '2026-09-26T10:00:01.000Z' })}\n`,
    );
  }
  const multiAgentHost = {
    status: vi.fn().mockReturnValue({ live: [], completed: [], pending: [] }),
    ensureDirector: vi.fn().mockResolvedValue(null),
  };
  return {
    handlers: createFleetCommandHandlers({
      multiAgentHost: multiAgentHost as never,
      getDirector: () => null,
      events: {} as never,
      getSessionId: () => 'session',
      fleetRoot,
    }),
  };
}

describe('fleet log sidecar classification', () => {
  it('does not list the store index or replay sidecars as subagent transcripts', async () => {
    const { handlers } = await makeHandlers(true);
    const listing = await handlers.onFleetLog?.(undefined, 'summary');
    expect(listing).toContain('1 subagent transcript on disk');
    expect(listing).toContain('agent-1');
    expect(listing).not.toContain('_index');
    expect(listing).not.toContain('agent-1.replay');
  });

  it('still resolves the real transcript by id alongside the sidecars', async () => {
    const { handlers } = await makeHandlers(true);
    const summary = await handlers.onFleetLog?.('agent-1', 'summary');
    expect(summary).toContain('3 events');
  });

  it('lists a single transcript when no sidecars exist', async () => {
    const { handlers } = await makeHandlers(false);
    const listing = await handlers.onFleetLog?.(undefined, 'summary');
    expect(listing).toContain('1 subagent transcript on disk');
  });
});

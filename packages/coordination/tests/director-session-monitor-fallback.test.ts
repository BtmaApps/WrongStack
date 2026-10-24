/**
 * `fleet session` on an external ACP worker: it runs no WrongStack session,
 * so there is no session file, but the agent monitor recorded its turn.
 */
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDirectorSubagentSession } from '../src/director-session.js';

let root: string | undefined;
afterEach(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('readDirectorSubagentSession monitor fallback', () => {
  it('summarises the monitor transcript when the worker has no session file', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ws-dir-session-'));
    const dir = path.join(root, 'transcripts', 'claude-w1');
    await fsp.mkdir(dir, { recursive: true });
    const entries = [
      { kind: 'system', content: 'Agent spawned' },
      { kind: 'tool_use', content: 'Terminal({})' },
      { kind: 'tool_result', content: 'Completed bun src/check.ts' },
      { kind: 'tool_use', content: 'Edit({})' },
      { kind: 'text', content: 'Fixed the coupon clamp; checks pass.' },
      { kind: 'status', content: 'Completed in 1 iterations' },
    ];
    await fsp.writeFile(
      path.join(dir, 'transcript.jsonl'),
      `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`,
    );

    const summary = await readDirectorSubagentSession({
      sessionsRoot: root,
      directorRunId: '2026-10-13/sess_x',
      subagentId: 'claude-w1',
    });
    expect(summary).toMatchObject({
      lastAssistantText: 'Fixed the coupon clamp; checks pass.',
      toolUsesObserved: 2,
      events: 6,
      path: path.join(dir, 'transcript.jsonl'),
    });

    expect(
      await readDirectorSubagentSession({
        sessionsRoot: root,
        directorRunId: '2026-10-13/sess_x',
        subagentId: 'nobody',
      }),
    ).toBeNull();
  });
});

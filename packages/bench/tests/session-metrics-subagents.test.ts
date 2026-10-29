import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readToolMetrics } from '../src/session-metrics.js';

let homeDir: string;
let workdir: string;

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-subagents-'));
  homeDir = path.join(base, 'home');
  workdir = path.join(base, 'work');
  await fs.mkdir(workdir, { recursive: true });

  // Write a session JSONL where the subprocess would have written it:
  // <home>/projects/<slug>/sessions/<id>.jsonl
  const sessionsDir = resolveWstackPaths({
    projectRoot: workdir,
    globalRoot: homeDir,
  }).projectSessions;
  await fs.mkdir(sessionsDir, { recursive: true });
  const events = [
    { type: 'session_start' },
    // Fleet delegation path: lifecycle event, one per spawned subagent.
    { type: 'delegate_started', delegationId: 'd1' },
    { type: 'delegate_started', delegationId: 'd2' },
    // Explicit spawn-tool path: only the ADMITTED spawn counts; a failed call
    // (ok:false) spawned nothing and must not, mirroring delegate_started.
    { type: 'tool_call_end', name: 'spawn_subagent', id: '3', ok: true },
    { type: 'tool_call_end', name: 'spawn_subagent', id: '4', ok: false },
    { type: 'tool_call_end', name: 'read', id: '5', ok: true },
    // A `delegate` TOOL completion carries no delegate_started here: the
    // lifecycle event is the counting signal, so this must NOT double-count.
    { type: 'tool_call_end', name: 'delegate', id: '6', ok: true },
    'this is not json', // tolerated
  ];
  const jsonl = events.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n');
  await fs.writeFile(path.join(sessionsDir, '01ABC.jsonl'), jsonl + '\n', 'utf8');
});

afterAll(async () => {
  await fs.rm(path.dirname(homeDir), { recursive: true, force: true });
});

describe('readToolMetrics subagent spawns', () => {
  it('counts delegate_started events plus admitted spawn_subagent tool calls', async () => {
    const m = await readToolMetrics({ homeDir, workdir });
    // 2 delegate_started + 1 admitted spawn_subagent (the ok:false call spawned nothing)
    expect(m.subagentSpawns).toBe(3);
    expect(m.totalCalls).toBe(4); // spawn_subagent x2, read, delegate
  });

  it('does not count failed spawn calls or a delegate tool completion without its lifecycle event', async () => {
    // Covered by the same fixture: the ok:false spawn_subagent row and the
    // bare tool_call_end name=delegate row contributed nothing beyond
    // totalCalls. Pin it explicitly so a future "also count those" change is
    // a conscious decision.
    const m = await readToolMetrics({ homeDir, workdir });
    expect(m.subagentSpawns).toBe(3); // unchanged by the failed spawn and delegate tool rows
  });

  it('returns zeroed metrics when no session log exists', async () => {
    const emptyBase = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-subagents-empty-'));
    const m = await readToolMetrics({
      homeDir: path.join(emptyBase, 'home'),
      workdir: path.join(emptyBase, 'work'),
    });
    expect(m).toEqual({
      totalCalls: 0,
      editCalls: 0,
      editErrors: 0,
      rateLimitRetries: 0,
      subagentSpawns: 0,
    });
    await fs.rm(emptyBase, { recursive: true, force: true });
  });
});

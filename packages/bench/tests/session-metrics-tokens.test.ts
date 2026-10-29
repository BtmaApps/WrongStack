import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTokenMetrics } from '../src/session-metrics.js';

let base: string;
let homeDir: string;
let workdir: string;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-tokens-'));
  homeDir = path.join(base, 'home');
  workdir = path.join(base, 'work');
  await fs.mkdir(workdir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

function jsonl(events: unknown[]): string {
  return `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
}

const response = (input: number, cacheRead: number, output: number) => ({
  type: 'llm_response',
  usage: { input, cacheRead, output },
});

describe('readTokenMetrics', () => {
  it('counts cache reads and every subagent transcript, but not the message-only mirror', async () => {
    const sessionsDir = resolveWstackPaths({
      projectRoot: workdir,
      globalRoot: homeDir,
    }).projectSessions;
    const shard = path.join(sessionsDir, '2026-10-27');
    const sessionDir = path.join(shard, 'sess_A');
    const subShard = path.join(sessionDir, 'subagents', '2026-10-27', 'sess_A');
    const mirror = path.join(sessionDir, 'subagents', 'transcripts', 'explore-companion-1');
    await fs.mkdir(subShard, { recursive: true });
    await fs.mkdir(mirror, { recursive: true });

    await fs.writeFile(
      path.join(shard, 'sess_A.jsonl'),
      jsonl([
        { type: 'session_start' },
        response(2000, 4000, 100),
        response(1000, 6000, 50),
        // session_end repeats the totals; counting it would double the leader.
        { type: 'session_end', usage: { input: 3000, cacheRead: 10000, output: 150 } },
      ]),
      'utf8',
    );
    await fs.writeFile(
      path.join(subShard, 'explore-companion-1.jsonl'),
      jsonl([
        response(500, 1500, 20),
        { type: 'llm_response', usage: { input: 10, cacheWrite: 90, output: 0 } },
      ]),
      'utf8',
    );
    await fs.writeFile(path.join(subShard, '_index.jsonl'), jsonl([response(9e6, 0, 0)]), 'utf8');
    await fs.writeFile(path.join(mirror, 'transcript.jsonl'), jsonl([response(9e6, 0, 0)]), 'utf8');

    const m = await readTokenMetrics({ homeDir, workdir });
    expect(m).toEqual({
      input: 3510,
      cacheRead: 11500,
      cacheWrite: 90,
      output: 170,
      requests: 4,
      subagentTotal: 2120,
      total: 15270,
    });
  });

  it('returns zeros when the run left no session log', async () => {
    const m = await readTokenMetrics({ homeDir, workdir });
    expect(m.total).toBe(0);
    expect(m.requests).toBe(0);
  });
});

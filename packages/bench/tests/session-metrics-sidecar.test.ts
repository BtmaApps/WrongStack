import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSessionLogEvents, readToolMetrics } from '../src/session-metrics.js';

let base: string;
let homeDir: string;
let workdir: string;
let sessionsDir: string;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-sidecar-'));
  homeDir = path.join(base, 'home');
  workdir = path.join(base, 'work');
  await fs.mkdir(workdir, { recursive: true });
  sessionsDir = resolveWstackPaths({ projectRoot: workdir, globalRoot: homeDir }).projectSessions;
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

const EVENTS = [
  JSON.stringify({ type: 'tool_call_end', name: 'read', id: '1', ok: true }),
  JSON.stringify({ type: 'tool_call_end', name: 'edit', id: '2', ok: true }),
  JSON.stringify({ type: 'provider_retry', status: 429 }),
].join('\n');

async function setMtime(file: string, iso: string): Promise<void> {
  const at = new Date(iso);
  await fs.utimes(file, at, at);
}

describe('newestJsonl ignores session-store sidecar files', () => {
  it('reads the transcript even when the store index sidecar is newer (sharded layout)', async () => {
    const shard = path.join(sessionsDir, '2026-09-26');
    await fs.mkdir(shard, { recursive: true });
    const transcript = path.join(shard, 'sess_sidecar.jsonl');
    await fs.writeFile(transcript, `${EVENTS}\n`);
    await fs.writeFile(
      path.join(sessionsDir, '_index.jsonl'),
      `${JSON.stringify({ id: '2026-09-26/sess_sidecar', title: 't', tokenTotal: 1 })}\n`,
    );
    // The store appends its index row when the session closes — after the
    // final transcript flush — so the sidecar mtime is newer.
    await setMtime(transcript, '2026-09-26T10:00:00Z');
    await setMtime(path.join(sessionsDir, '_index.jsonl'), '2026-09-26T10:00:05Z');

    const m = await readToolMetrics({ homeDir, workdir });
    expect(m).toEqual({ totalCalls: 2, editCalls: 1, editErrors: 0, rateLimitRetries: 1 });
  });

  it('reads the transcript even when a per-session sidecar (.replay.jsonl) is newer', async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    const transcript = path.join(sessionsDir, 'sess_sidecar.jsonl');
    await fs.writeFile(transcript, `${EVENTS}\n`);
    const replay = path.join(sessionsDir, 'sess_sidecar.replay.jsonl');
    await fs.writeFile(replay, `${JSON.stringify({ type: 'replay_marker' })}\n`);
    await setMtime(transcript, '2026-09-26T10:00:00Z');
    await setMtime(replay, '2026-09-26T10:00:05Z');

    const events = await readSessionLogEvents({ homeDir, workdir });
    expect(events.filter((e) => e['type'] === 'tool_call_end')).toHaveLength(2);
  });

  it('returns empty metrics when only sidecar files exist (crashed run)', async () => {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(path.join(sessionsDir, '_mailbox.jsonl'), '{}\n');
    const m = await readToolMetrics({ homeDir, workdir });
    expect(m).toEqual({ totalCalls: 0, editCalls: 0, editErrors: 0, rateLimitRetries: 0 });
  });
});

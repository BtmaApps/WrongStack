import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLeaderSession, writeLeaderSession } from '../src/acp-leader/acp-leader-resume.js';

const dirs: string[] = [];
const valid = { agentId: 'claude-code', agentSessionId: 'old', updatedAt: '2026-01-01T00:00:00Z' };
const fresh = { agentId: 'claude-code', agentSessionId: 'new' };

async function setup(records: unknown) {
  const dir = await mkdtemp(join(tmpdir(), 'ws-resume-records-'));
  dirs.push(dir);
  const file = join(dir, 'acp-leader-sessions.json');
  await writeFile(file, JSON.stringify(records));
  return { dir, file };
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('ACP leader resume record validation', () => {
  it('saves new mappings without losing a valid neighbor when another record is null', async () => {
    const { dir, file } = await setup({ valid, corrupt: null });
    expect(await readLeaderSession(dir, 'valid', 'claude-code')).toBe('old');
    await writeLeaderSession(dir, 'new', fresh);
    expect(await readLeaderSession(dir, 'new', 'claude-code')).toBe('new');
    expect(JSON.parse(await readFile(file, 'utf8')).valid).toEqual(valid);
  });

  it.each([
    false,
    1,
    'bad',
    [],
    {},
    { ...valid, updatedAt: 42 },
    { ...valid, agentId: null },
    { ...valid, agentSessionId: 42 },
  ])('drops malformed records before sorting or returning them: %j', async (corrupt) => {
    const { dir, file } = await setup({ valid, corrupt });
    expect(await readLeaderSession(dir, 'corrupt', 'claude-code')).toBeUndefined();
    await writeLeaderSession(dir, 'new', fresh);
    expect(await readLeaderSession(dir, 'new', 'claude-code')).toBe('new');
    expect(Object.hasOwn(JSON.parse(await readFile(file, 'utf8')), 'corrupt')).toBe(false);
  });

  it.each([null, [], false])(
    'recovers from a non-record root and serializes repeated writes: %j',
    async (root) => {
      const { dir } = await setup(root);
      await Promise.all([
        writeLeaderSession(dir, 'one', fresh),
        writeLeaderSession(dir, 'two', { ...fresh, agentSessionId: 'two' }),
      ]);
      expect(await readLeaderSession(dir, 'one', 'claude-code')).toBe('new');
      expect(await readLeaderSession(dir, 'two', 'claude-code')).toBe('two');
      expect(await readLeaderSession(dir, 'one', 'different-agent')).toBeUndefined();
    },
  );
});

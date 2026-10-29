import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { handlePrefsGet, type PrefsHandlerContext } from '../src/server/prefs-handlers';
import { profileIdentity } from '../src/server/profile-identity';

describe('runtime profile ownership', () => {
  it('identifies the actual config path across updates, separating identical profile names under different homes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wrongstack-profile-identity-'));
    try {
      const a = join(root, 'one', 'profiles', 'default'),
        b = join(root, 'two', 'profiles', 'default');
      await Promise.all([mkdir(a, { recursive: true }), mkdir(b, { recursive: true })]);
      const file = join(a, 'config.json'),
        initial = profileIdentity(file);
      await Promise.all([writeFile(file, '{}'), writeFile(join(b, 'config.json'), '{}')]);
      expect(profileIdentity(file)).toEqual(initial);
      expect(profileIdentity(join(a, '..', 'default', 'config.json'))).toEqual(initial);
      expect(profileIdentity(join(b, 'config.json')).id).not.toBe(initial.id);
      await writeFile(file, '{"provider":"changed"}');
      expect(profileIdentity(file)).toEqual(initial);
      expect(initial).toEqual({ id: expect.stringMatching(/^[a-f0-9]{64}$/), name: 'default' });
      expect(() => profileIdentity('')).toThrow(/unavailable/);
    } finally {
      expect(dirname(resolve(root)).toLowerCase()).toBe(resolve(tmpdir()).toLowerCase());
      expect(basename(root).startsWith('wrongstack-profile-identity-')).toBe(true);
      await rm(root, { recursive: true, force: true });
    }
  });
  it('publishes host-owned identity independently of editable/session preference snapshots', () => {
    const identity = { id: 'a'.repeat(64), name: 'reviewed-profile' },
      send = vi.fn();
    const ctx = {
      snapshot: () => ({ theme: 'dark', profileIdentity: { id: 'spoofed' } }),
      send,
      profileIdentity: identity,
    } as unknown as PrefsHandlerContext;
    handlePrefsGet(ctx, {} as never, 'session-one');
    expect(send.mock.calls[0]?.[1].payload).toMatchObject({
      profileIdentity: identity,
      sessionId: 'session-one',
    });
    handlePrefsGet(
      { snapshot: () => ({ theme: 'dark' }), send } as unknown as PrefsHandlerContext,
      {} as never,
    );
    expect(send.mock.calls[1]?.[1].payload).toEqual({ theme: 'dark' });
  });
});

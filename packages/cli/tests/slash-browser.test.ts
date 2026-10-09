import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserPrivateOrigins } from '@wrongstack/tools/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBrowserCommand } from '../src/slash-commands/browser.js';

let root: string;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});
describe('/browser', () => {
  it('accepts loopback origin shorthand without broadening its port scope', async () => {
    root = await mkdtemp(join(tmpdir(), 'slash-network-'));
    vi.stubEnv('WRONGSTACK_HOME', join(root, 'home'));
    vi.stubEnv('WRONGSTACK_BROWSER_PRIVATE_ORIGINS', '');
    const command = buildBrowserCommand();
    const ctx = { projectRoot: root } as never;
    for (const origin of ['localhost:3000', '127.0.0.1:4000', '[::1]:5000']) {
      expect((await command.run(`allow ${origin}`, ctx))?.message).toContain('policy saved');
    }
    expect(browserPrivateOrigins(root)).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:4000',
      'http://[::1]:5000',
    ]);
    expect((await command.run('remove localhost:3000', ctx))?.message).toContain('policy saved');
    expect(browserPrivateOrigins(root)).not.toContain('http://localhost:3000');
    expect((await command.run('allow localhost:*', ctx))?.message).toContain('failed');
  });
  it('allows and revokes an exact project origin from the REPL', async () => {
    root = await mkdtemp(join(tmpdir(), 'slash-browser-'));
    vi.stubEnv('WRONGSTACK_HOME', join(root, 'home'));
    vi.stubEnv('WRONGSTACK_BROWSER_PRIVATE_ORIGINS', '');
    const command = buildBrowserCommand();
    const ctx = { projectRoot: root } as never;
    expect((await command.run('allow http://localhost:3000', ctx))?.message).toContain(
      'policy saved',
    );
    expect(browserPrivateOrigins(root)).toEqual(['http://localhost:3000']);
    expect((await command.run('remove http://localhost:3000', ctx))?.message).toContain('(none)');
    expect(browserPrivateOrigins(root)).toEqual([]);
    expect((await command.run('allow http://localhost:3000/admin', ctx))?.message).toContain(
      'origin',
    );
    expect((await command.run('allow', ctx))?.message).toContain('/browser allow');
  });
});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultConfigStore } from '@wrongstack/core/storage';
import type { Config } from '@wrongstack/core/types';
import { describe, expect, it, vi } from 'vitest';
import type { SlashCommandContext } from '../src/slash-commands/command-context.js';
import { buildJevCommand } from '../src/slash-commands/jev.js';

describe('/jev', () => {
  it('shows features, settings and activity entry points without exposing a credential', async () => {
    const command = buildJevCommand({
      configStore: new DefaultConfigStore({
        version: 1,
        typesafe: { apiKey: 'private-key' },
      } as Config),
    } as unknown as SlashCommandContext);
    const result = await command.run('');
    expect(result?.message).toContain('/jev logs');
    expect(result?.message).toContain('memoryRecall');
    expect(result?.message).not.toContain('private-key');
  });
  it('persists feature switches through the shared settings path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jev-command-'));
    try {
      const file = join(dir, 'config.json');
      const store = new DefaultConfigStore({ version: 1 } as Config);
      const command = buildJevCommand({
        configStore: store,
        paths: { profileConfig: () => file },
      } as unknown as SlashCommandContext);
      expect((await command.run('feature brain off'))?.message).toContain('saved');
      expect(JSON.parse(await readFile(file, 'utf8')).typesafe.judgments.brain).toBe(false);
      expect(store.get().typesafe?.judgments?.brain).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('refuses credential setup on surfaces without masked input', async () => {
    const readText = vi.fn();
    const command = buildJevCommand({
      configStore: new DefaultConfigStore({ version: 1 } as Config),
      paths: {},
      readText,
    } as unknown as SlashCommandContext);
    expect((await command.run('login typesafe'))?.message).toContain(
      'Secure key input unavailable',
    );
    expect(readText).not.toHaveBeenCalled();
  });
});

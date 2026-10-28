import { describe, expect, it } from 'vitest';
import { environmentDraft, environmentProfile } from '../src/automation-environment-model';

describe('automation environment authoring', () => {
  it('round trips executable argv and typed services, caches and ports without shell evaluation', () => {
    const profile = {
      version: 1 as const,
      name: 'test',
      image: 'trusted:1',
      setupTimeoutMs: 60000,
      setupCommands: [['bun', 'run', 'test', 'space value']],
      services: [
        {
          name: 'db',
          image: 'postgres:18',
          command: [],
          healthCommand: ['pg_isready', '-U', 'test'],
          envNames: ['DB_PASSWORD'],
        },
      ],
      caches: [{ name: 'bun', target: '/home/node/.bun/install/cache' }],
      ports: [{ name: 'preview', port: 3000, protocol: 'http' as const }],
    };
    expect(environmentProfile(environmentDraft(profile))).toEqual(profile);
  });
  it('uses canonical validation and refuses multiline service commands, secrets as names and unsafe cache paths', () => {
    const draft = environmentDraft(undefined, 'trusted:1');
    draft.services.push({
      name: 'db',
      image: 'postgres:18',
      command: 'echo one\necho two',
      health: 'pg_isready',
      envNames: '',
    });
    expect(() => environmentProfile(draft)).toThrow('one command line');
    draft.services[0]!.command = '';
    draft.services[0]!.envNames = 'DB_PASSWORD=secret';
    expect(() => environmentProfile(draft)).toThrow('names only');
    draft.services[0]!.envNames = 'DB_PASSWORD';
    draft.caches.push({ name: 'bad', target: '/workspace' });
    expect(() => environmentProfile(draft)).toThrow('package-cache');
  });
});

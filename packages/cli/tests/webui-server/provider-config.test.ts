import { randomBytes } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProviderConfigStore,
  getVault,
  loadSavedProviders,
  saveProviders,
} from '../../src/webui-server/provider-config.js';

describe('provider-config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.env.TEMP || '/tmp', `test-${randomBytes(4).toString('hex')}`);
    fsSync.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  describe('getVault', () => {
    it('creates vault with correct keyFile path', () => {
      const configPath = path.join(tempDir, 'config.json');
      const vault = getVault(configPath);
      expect(vault).toBeDefined();
    });

    it('handles undefined path', () => {
      const vault = getVault(undefined);
      expect(vault).toBeDefined();
    });
  });

  describe('loadSavedProviders', () => {
    it('returns empty object when path is undefined', async () => {
      const result = await loadSavedProviders(undefined);
      expect(result).toEqual({});
    });

    it('returns empty object when file does not exist', async () => {
      const result = await loadSavedProviders(path.join(tempDir, 'nonexistent.json'));
      expect(result).toEqual({});
    });

    it('loads providers from config file', async () => {
      const configPath = path.join(tempDir, 'config.json');
      const configContent = {
        providers: {
          anthropic: { apiKey: 'test-key', models: ['anthropic-test-model'] },
        },
      };
      fsSync.writeFileSync(configPath, JSON.stringify(configContent));

      const result = await loadSavedProviders(configPath);
      expect(result).toEqual(configContent.providers);
    });
  });

  describe('saveProviders', () => {
    it('preserves concurrent edits to different providers and rejects stale edits to the same provider', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fsSync.writeFileSync(
        configPath,
        JSON.stringify({ providers: { alpha: { apiKey: 'a' }, beta: { apiKey: 'b' } } }),
      );
      const first = await loadSavedProviders(configPath);
      const second = await loadSavedProviders(configPath);
      first['alpha']!.models = ['a1'];
      second['beta']!.models = ['b1'];
      await Promise.all([saveProviders(configPath, first), saveProviders(configPath, second)]);
      const saved = await loadSavedProviders(configPath);
      expect(saved['alpha']!.models).toEqual(['a1']);
      expect(saved['beta']!.models).toEqual(['b1']);
      expect(second['alpha']!.models).toEqual(['a1']);
      const stale = await loadSavedProviders(configPath);
      const fresh = await loadSavedProviders(configPath);
      fresh['alpha']!.models = ['a2'];
      await saveProviders(configPath, fresh);
      stale['alpha']!.models = ['a3'];
      await expect(saveProviders(configPath, stale)).rejects.toThrow('Refresh and try again');
      expect((await loadSavedProviders(configPath))['alpha']!.models).toEqual(['a2']);
    });
    it('does nothing when path is undefined', async () => {
      await expect(saveProviders(undefined, { anthropic: {} as never })).resolves.not.toThrow();
    });

    it('saves providers to config file', async () => {
      const configPath = path.join(tempDir, 'config.json');
      // Create existing config with some data
      const existingConfig = { otherField: 'value' };
      fsSync.writeFileSync(configPath, JSON.stringify(existingConfig));

      const providers = {
        anthropic: { apiKey: 'new-key', models: ['anthropic-test-model'] },
      };

      await saveProviders(configPath, providers as never);

      const saved = JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
      // API keys are encrypted, so check structure
      expect(saved.providers.anthropic).toBeDefined();
      expect(saved.providers.anthropic.models).toEqual(['anthropic-test-model']);
      expect(saved.otherField).toBe('value'); // other fields preserved
    });

    it('creates config file if it does not exist', async () => {
      const configPath = path.join(tempDir, 'new-config.json');
      const providers = { openai: { apiKey: 'key' } as never };

      await saveProviders(configPath, providers as never);

      const saved = JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
      expect(saved.providers.openai).toBeDefined();
    });
  });

  describe('createProviderConfigStore', () => {
    it('merges concurrent owned-account edits while retaining inherited accounts', async () => {
      const configPath = path.join(tempDir, 'config.json');
      const owned = {
        alpha: { type: 'openai', apiKey: 'a' },
        beta: { type: 'openai', apiKey: 'b' },
      };
      fsSync.writeFileSync(configPath, JSON.stringify({ providers: owned }));
      const store = createProviderConfigStore(configPath, () => ({
        ...owned,
        project: { type: 'openai', apiKey: 'project-key' },
      }));
      const first = await store.load();
      const second = await store.load();
      first['alpha']!.models = ['a1'];
      second['beta']!.models = ['b1'];
      await store.save(first);
      await store.save(second);
      expect(second['alpha']?.models).toEqual(['a1']);
      expect(second['beta']?.models).toEqual(['b1']);
      expect(second['project']?.apiKey).toBe('project-key');
      const saved = await loadSavedProviders(configPath);
      expect(saved['project']).toBeUndefined();
      expect(saved['alpha']?.models).toEqual(['a1']);
      expect(saved['beta']?.models).toEqual(['b1']);
    });

    it('keeps inherited accounts visible after adding an account without copying their credentials', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fsSync.writeFileSync(configPath, JSON.stringify({ providers: {} }));
      const inherited = { project: { type: 'openai', apiKey: 'project-only-key' } };
      const store = createProviderConfigStore(configPath, () => inherited);
      const providers = await store.load();
      providers['work'] = { type: 'openai', apiKey: 'work-key' };
      await store.save(providers);
      expect(providers['project']).toEqual(inherited.project);
      const saved = await loadSavedProviders(configPath);
      expect(saved['project']).toBeUndefined();
      expect(saved['work']?.apiKey).toBe('work-key');
      providers['work']!.models = ['updated-model'];
      await store.save(providers);
      expect((await loadSavedProviders(configPath))['work']?.models).toEqual(['updated-model']);
      delete providers['work'];
      await store.save(providers);
      expect(await loadSavedProviders(configPath)).toEqual({});
      expect(providers['project']).toEqual(inherited.project);
    });

    it('explains why an inherited account cannot be edited through another config file', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fsSync.writeFileSync(configPath, JSON.stringify({ providers: {} }));
      const store = createProviderConfigStore(configPath, () => ({
        project: { type: 'openai', apiKey: 'project-only-key' },
      }));
      const providers = await store.load();
      providers['project']!.apiKey = 'changed-key';
      await expect(store.save(providers)).rejects.toThrow('another config file');
      expect(await loadSavedProviders(configPath)).toEqual({});
    });

    it('protects a project override sharing an alias with a disk account', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fsSync.writeFileSync(
        configPath,
        JSON.stringify({
          providers: { shared: { type: 'openai', apiKey: 'disk-key' } },
        }),
      );
      const store = createProviderConfigStore(configPath, () => ({
        shared: { type: 'openai', apiKey: 'project-key' },
      }));
      const providers = await store.load();
      providers['work'] = { type: 'openai', apiKey: 'work-key' };
      await store.save(providers);
      expect(providers['shared']?.apiKey).toBe('project-key');
      expect((await loadSavedProviders(configPath))['shared']?.apiKey).toBe('disk-key');
      delete providers['shared'];
      await expect(store.save(providers)).rejects.toThrow('another config file');
      expect((await loadSavedProviders(configPath))['shared']?.apiKey).toBe('disk-key');
    });

    it('returns a store with load and save methods', () => {
      const store = createProviderConfigStore(path.join(tempDir, 'config.json'));
      expect(typeof store.load).toBe('function');
      expect(typeof store.save).toBe('function');
    });

    it('load returns empty when no config', async () => {
      const store = createProviderConfigStore(path.join(tempDir, 'nonexistent.json'));
      const result = await store.load();
      expect(result).toEqual({});
    });

    it('load returns empty when path is undefined', async () => {
      const store = createProviderConfigStore(undefined);
      const result = await store.load();
      expect(result).toEqual({});
    });

    it('save updates the config file', async () => {
      const configPath = path.join(tempDir, 'config.json');
      fsSync.writeFileSync(configPath, JSON.stringify({ other: 'data' }));

      const store = createProviderConfigStore(configPath);
      await store.save({ anthropic: { apiKey: 'key' } as never });

      const saved = JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
      expect(saved.providers.anthropic).toBeDefined();
      expect(saved.other).toBe('data');
    });

    it('save does nothing when path is undefined', async () => {
      const store = createProviderConfigStore(undefined);
      await expect(store.save({})).resolves.not.toThrow();
    });
  });
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultSecretVault } from '@wrongstack/core/security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSavedProviders,
  mutateSavedProviders,
  saveProviders,
} from '../src/server/provider-config-io.js';

describe('standalone provider config persistence', () => {
  let dir: string;
  let configPath: string;
  let vault: DefaultSecretVault;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auth-persistence-'));
    configPath = path.join(dir, 'config.json');
    vault = new DefaultSecretVault({ keyFile: path.join(dir, '.key') });
    await saveProviders(configPath, vault, {
      alpha: { type: 'openai', apiKey: 'secret-alpha' },
      beta: { type: 'openai', apiKey: 'secret-beta' },
    });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('merges independent stale snapshots, preserves encrypted keys, and detects conflicting edits', async () => {
    const first = await loadSavedProviders(configPath, vault);
    const second = await loadSavedProviders(configPath, vault);
    first['alpha']!.models = ['a1'];
    second['beta']!.models = ['b1'];
    await Promise.all([
      saveProviders(configPath, vault, first),
      saveProviders(configPath, vault, second),
    ]);
    const stored = await loadSavedProviders(configPath, vault);
    expect(stored['alpha']!.models).toEqual(['a1']);
    expect(stored['beta']!.models).toEqual(['b1']);
    expect(stored['alpha']!.apiKey).toBe('secret-alpha');
    expect(await fs.readFile(configPath, 'utf8')).not.toContain('secret-alpha');
    stored['alpha']!.models = ['a2'];
    await saveProviders(configPath, vault, stored);
    first['alpha']!.models = ['stale'];
    await expect(saveProviders(configPath, vault, first)).rejects.toThrow('Refresh and try again');
    expect((await loadSavedProviders(configPath, vault))['alpha']!.models).toEqual(['a2']);
  });

  it('removes defaults and routing references without damaging unrelated configuration', async () => {
    const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
    Object.assign(raw, {
      provider: 'alpha',
      model: 'a1',
      fallbackModels: ['alpha/a1', 'beta/b1'],
      favoriteModels: ['alpha/a1'],
      unrelated: { enabled: true },
    });
    await fs.writeFile(configPath, JSON.stringify(raw));
    const providers = await loadSavedProviders(configPath, vault);
    delete providers['alpha'];
    await saveProviders(configPath, vault, providers);
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(saved.provider).toBeUndefined();
    expect(saved.model).toBeUndefined();
    expect(saved.fallbackModels).toEqual(['beta/b1']);
    expect(saved.favoriteModels).toEqual([]);
    expect(saved.unrelated).toEqual({ enabled: true });
    expect((await loadSavedProviders(configPath, vault))['beta']!.apiKey).toBe('secret-beta');
  });
  describe('secrets this vault cannot decrypt (other or rotated key)', () => {
    let foreignTypesafe: string;
    let foreignGamma: string;
    beforeEach(async () => {
      // Ciphertext produced under a DIFFERENT key file: this vault's decrypt
      // fails on it, exactly like a value written before a key rotation.
      const other = new DefaultSecretVault({ keyFile: path.join(dir, '.other-key') });
      foreignTypesafe = other.encrypt('typesafe-secret');
      foreignGamma = other.encrypt('gamma-secret');
      const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
      raw.typesafe = { apiKey: foreignTypesafe };
      raw.providers.gamma = { type: 'openai', apiKey: foreignGamma };
      await fs.writeFile(configPath, JSON.stringify(raw));
    });

    it('a provider edit keeps them byte-for-byte, including on the edited provider', async () => {
      const providers = await loadSavedProviders(configPath, vault);
      // The UI still sees the undecryptable key as blank, never as ciphertext.
      expect(providers['gamma']!.apiKey).toBe('');
      providers['gamma']!.models = ['g1'];
      providers['beta']!.models = ['b1'];
      await saveProviders(configPath, vault, providers);
      expect(providers['gamma']!.apiKey).toBe('');
      const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(saved.typesafe.apiKey).toBe(foreignTypesafe);
      expect(saved.providers.gamma.apiKey).toBe(foreignGamma);
      expect(saved.providers.gamma.models).toEqual(['g1']);
      expect((await loadSavedProviders(configPath, vault))['beta']!.apiKey).toBe('secret-beta');
    });

    it('a key the user actually replaces still wins', async () => {
      const providers = await loadSavedProviders(configPath, vault);
      providers['gamma']!.apiKey = 'new-gamma';
      await saveProviders(configPath, vault, providers);
      expect((await loadSavedProviders(configPath, vault))['gamma']!.apiKey).toBe('new-gamma');
    });

    it('a background token-refresh write keeps them', async () => {
      await mutateSavedProviders(configPath, vault, (providers) => {
        providers['alpha']!.apiKey = 'rotated-alpha';
      });
      const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(saved.typesafe.apiKey).toBe(foreignTypesafe);
      expect(saved.providers.gamma.apiKey).toBe(foreignGamma);
      expect((await loadSavedProviders(configPath, vault))['alpha']!.apiKey).toBe('rotated-alpha');
    });
  });
});

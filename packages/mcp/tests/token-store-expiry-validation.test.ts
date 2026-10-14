import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultSecretVault } from '@wrongstack/core/security';
import { expect, it } from 'vitest';
import { type MCPStoredAuthorization, MCPVaultTokenStore } from '../src/token-store.js';

it('rejects all non-finite expiry values and retains exact disk bytes and neighboring credentials', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-expiry-validation-'));
  const file = path.join(dir, '.wrongstack/auth.json');
  const vault = new DefaultSecretVault({ keyFile: path.join(dir, '.wrongstack/.key') });
  const store = new MCPVaultTokenStore(file, vault);
  const value: MCPStoredAuthorization = {
    serverName: 'fixture',
    resource: 'https://mcp.example.test/mcp',
    clientId: 'fixture',
    updatedAt: '2026-01-01T00:00:00.000Z',
    authorizationServer: {
      issuer: 'https://auth.example.test',
      authorizationEndpoint: 'https://auth.example.test/authorize',
      tokenEndpoint: 'https://auth.example.test/token',
      scopesSupported: [],
    },
    tokenSet: {
      accessToken: 'fixture-access',
      resource: 'https://mcp.example.test/mcp',
      tokenType: 'Bearer',
      scopes: [],
    },
  };
  try {
    await store.save(value);
    await store.save({ ...value, serverName: 'neighbor' });
    const before = await fs.readFile(file, 'utf8');
    for (const expiresAt of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expect(
        store.save({ ...value, tokenSet: { ...value.tokenSet, expiresAt } }),
      ).rejects.toThrow(/finite number/);
      expect(await fs.readFile(file, 'utf8')).toBe(before);
      expect((await store.load('neighbor', value.resource))?.tokenSet.accessToken).toBe(
        'fixture-access',
      );
    }
    for (const expiresAt of [0, -1, Number.MAX_SAFE_INTEGER]) {
      await store.save({ ...value, tokenSet: { ...value.tokenSet, expiresAt } });
      expect((await store.load(value.serverName, value.resource))?.tokenSet.expiresAt).toBe(
        expiresAt,
      );
    }
    await store.save(value);
    expect(
      (await store.load(value.serverName, value.resource))?.tokenSet.expiresAt,
    ).toBeUndefined();
  } finally {
    await vault.flushHardening();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

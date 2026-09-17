/**
 * Shared config I/O helpers for the `providers` map inside a profile config.
 *
 * Extracted from both `packages/webui/src/server/index.ts` and
 * `packages/cli/src/webui-server.ts` so the CLI's `--webui` mode doesn't
 * duplicate the read-merge-decrypt / encrypt-write cycle. Callers supply
 * their own vault (already booted) and config path — this module is pure I/O
 * with no side-channel state.
 */
import * as fs from 'node:fs/promises';
import { decryptConfigSecrets, encryptConfigSecrets } from '@wrongstack/core/security';
import { ConfigError, type ProviderConfig, type SecretVault } from '@wrongstack/core/types';
import { atomicWrite, withFileLock } from '@wrongstack/core/utils';
import {
  clearStaleProviderDefaults,
  ProviderConfigSnapshots,
  removeProviderFallbackReferences,
  validateProviderConfigShape,
} from '@wrongstack/providers';

const snapshots = new ProviderConfigSnapshots();
let writeChain: Promise<void> = Promise.resolve();

/** Atomic credential/model updates share the provider CRUD writer queue and lock. */
export async function mutateSavedProviders(
  configPath: string,
  vault: SecretVault,
  mutate: (providers: Record<string, ProviderConfig>) => void,
): Promise<void> {
  const write = writeChain.then(() =>
    withFileLock(configPath, async () => {
      let raw: string;
      try {
        raw = await fs.readFile(configPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      const config = JSON.parse(raw) as Record<string, unknown>;
      validateProviderConfigShape(config);
      const decrypted = decryptConfigSecrets(config, vault);
      const providers = (decrypted['providers'] ?? {}) as Record<string, ProviderConfig>;
      const before = JSON.stringify(providers);
      mutate(providers);
      if (JSON.stringify(providers) === before) return;
      decrypted['providers'] = providers;
      await atomicWrite(
        configPath,
        JSON.stringify(encryptConfigSecrets(decrypted, vault), null, 2),
        { mode: 0o600 },
      );
    }),
  );
  writeChain = write.catch(() => undefined);
  await write;
}

/**
 * Read the `providers` section from a profile config, decrypting
 * secret-bearing fields. Returns an empty record when the config file
 * doesn't exist or has no `providers` key.
 */
export async function loadSavedProviders(
  configPath: string,
  vault: SecretVault,
): Promise<Record<string, ProviderConfig>> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return snapshots.track({});
    throw new ConfigError({
      message: `Could not read config at ${configPath}.`,
      code: 'CONFIG_PARSE_FAILED',
      context: { filePath: configPath },
      cause: error,
    });
  }
  let parsed: { providers?: Record<string, ProviderConfig> } = {};
  try {
    parsed = JSON.parse(raw) as { providers?: Record<string, ProviderConfig> };
    validateProviderConfigShape(parsed);
  } catch (error) {
    throw new ConfigError({
      message: `Invalid config at ${configPath}. Fix the file before managing credentials.`,
      code: 'CONFIG_PARSE_FAILED',
      context: { filePath: configPath },
      cause: error,
    });
  }
  if (!parsed.providers) return snapshots.track({});
  return snapshots.track(decryptConfigSecrets(parsed.providers, vault));
}

/**
 * Write `providers` to the active profile config, encrypting secrets first.
 * Refuses to overwrite a corrupt-but-existing config file (the operator
 * should fix it manually). When the config file is missing (ENOENT), starts
 * from an empty object.
 */
export async function saveProviders(
  configPath: string,
  vault: SecretVault,
  providers: Record<string, ProviderConfig>,
  profileConfigPath?: string | undefined,
): Promise<void> {
  const write = writeChain.then(() =>
    withFileLock(profileConfigPath ?? configPath, async () => {
      const targetPath = profileConfigPath ?? configPath;
      let raw: string;
      let fileExists = true;
      try {
        raw = await fs.readFile(targetPath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new ConfigError({
            message: `Refusing to mutate ${targetPath}: ${(err as Error).message}`,
            code: 'CONFIG_PARSE_FAILED',
            context: { filePath: targetPath },
            cause: err,
          });
        }
        fileExists = false;
        raw = '{}';
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
        validateProviderConfigShape(parsed);
      } catch (err) {
        if (fileExists) {
          throw new ConfigError({
            message:
              `Refusing to overwrite corrupt config at ${targetPath} ` +
              `(${(err as Error).message}). Fix or move the file aside before retrying.`,
            code: 'CONFIG_PARSE_FAILED',
            context: { filePath: targetPath },
            cause: err,
          });
        }
        parsed = {};
      }
      const decrypted = decryptConfigSecrets(parsed, vault) as Record<string, unknown>;
      const previousProviders = (decrypted['providers'] as Record<string, ProviderConfig>) ?? {};
      const primaryBefore = JSON.stringify([
        decrypted['provider'],
        decrypted['model'],
        typeof decrypted['provider'] === 'string'
          ? previousProviders[decrypted['provider']]
          : undefined,
      ]);
      const previousIds = Object.keys(
        (decrypted['providers'] as Record<string, ProviderConfig>) ?? {},
      );
      const merged = snapshots.merge(
        (decrypted['providers'] as Record<string, ProviderConfig>) ?? {},
        providers,
      );
      decrypted['providers'] = merged;
      for (const id of previousIds) {
        if (!Object.hasOwn(merged, id)) removeProviderFallbackReferences(decrypted, id);
      }
      const primaryAfter = JSON.stringify([
        decrypted['provider'],
        decrypted['model'],
        typeof decrypted['provider'] === 'string' ? merged[decrypted['provider']] : undefined,
      ]);
      clearStaleProviderDefaults(decrypted, { preservePrimary: primaryBefore === primaryAfter });
      const encrypted = encryptConfigSecrets(decrypted, vault);
      await atomicWrite(targetPath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
      for (const id of Object.keys(providers)) delete providers[id];
      Object.assign(providers, merged);
      snapshots.track(providers);
    }),
  );
  writeChain = write.catch(() => undefined);
  await write;
}

// createProviderConfigIO (the standalone boot-phase helper) lives in
// provider-config-standalone.ts so this module stays vault-free.

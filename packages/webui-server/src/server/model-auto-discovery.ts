import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config, Logger, ModelsDevPayload, ModelsDevProvider } from '@wrongstack/core/types';
import { discoverOpenAICompatibleModels, resolveDiscoveryTargets } from '@wrongstack/providers';

interface DiscoverCacheEntry {
  fetchedAt: string;
  provider: ModelsDevProvider;
}

type DiscoverCache = Record<string, DiscoverCacheEntry>;

interface OverlayRegistry {
  mergeOverlay(
    payload: ModelsDevPayload,
    opts?: {
      authoritativeProviderIds?: readonly string[] | undefined;
      observedAt?: string | undefined;
    },
  ): void;
}

function isOverlayRegistry(value: unknown): value is OverlayRegistry {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as OverlayRegistry).mergeOverlay === 'function'
  );
}

async function readCache(file: string): Promise<DiscoverCache> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as DiscoverCache)
      : {};
  } catch {
    return {};
  }
}

function validCacheEntry(value: unknown): value is DiscoverCacheEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as { fetchedAt?: unknown; provider?: unknown };
  if (
    typeof entry.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(entry.fetchedAt)) ||
    !entry.provider ||
    typeof entry.provider !== 'object'
  ) {
    return false;
  }
  const models = (entry.provider as { models?: unknown }).models;
  return !!models && typeof models === 'object' && !Array.isArray(models);
}

export async function discoverAndMergeWebuiProviders(opts: {
  config: Config;
  registry: unknown;
  cacheDir: string;
  logger?: Pick<Logger, 'debug' | 'info' | 'warn'> | undefined;
  fetchImpl?: typeof fetch | undefined;
}): Promise<void> {
  const registry = opts.registry;
  if (!isOverlayRegistry(registry)) return;
  const targets = resolveDiscoveryTargets(opts.config);
  if (targets.length === 0) return;

  const cacheFile = path.join(opts.cacheDir, 'discovered-models-cache.json');
  const cache = await readCache(cacheFile);
  let cacheDirty = false;

  await Promise.all(
    targets.map(
      async ({
        id,
        cfg,
        baseUrl,
        apiKey,
        cacheKey,
        modelDiscoveryPath,
        modelDiscoveryAuthoritative,
        accountCatalog,
        copilotCatalog,
        modelsUrl,
        headers,
      }) => {
        const provider = await discoverOpenAICompatibleModels(id, {
          baseUrl,
          apiKey,
          headers: { ...cfg.headers, ...headers },
          accountCatalog,
          copilotCatalog,
          modelsUrl,
          providerName: id,
          ...(modelDiscoveryPath ? { modelDiscoveryPath } : {}),
          fetchImpl: opts.fetchImpl,
        });
        if (provider) {
          if (accountCatalog) cfg.models = Object.keys(provider.models);
          const fetchedAt = new Date().toISOString();
          cache[cacheKey] = { fetchedAt, provider };
          cacheDirty = true;
          if (modelDiscoveryAuthoritative) {
            registry.mergeOverlay(
              { [id]: provider },
              { observedAt: fetchedAt, authoritativeProviderIds: [id] },
            );
          } else {
            registry.mergeOverlay({ [id]: provider });
          }
          opts.logger?.info?.(
            `auto-discovered ${Object.keys(provider.models).length} models for "${id}" from ${baseUrl}`,
          );
          return;
        }

        const candidate = cache[cacheKey];
        const cached = validCacheEntry(candidate) ? candidate : undefined;
        if (candidate !== undefined && !cached) {
          delete cache[cacheKey];
          cacheDirty = true;
        }
        if (cached) {
          if (accountCatalog) cfg.models = Object.keys(cached.provider.models);
          if (modelDiscoveryAuthoritative) {
            registry.mergeOverlay(
              { [id]: cached.provider },
              { observedAt: cached.fetchedAt, authoritativeProviderIds: [id] },
            );
          } else {
            registry.mergeOverlay({ [id]: cached.provider });
          }
          opts.logger?.warn?.(
            `auto-discovery for "${id}" failed; using ${
              Object.keys(cached.provider.models).length
            } cached models from ${cached.fetchedAt}`,
          );
        } else {
          if (accountCatalog) {
            cfg.models = [];
            registry.mergeOverlay(
              {
                [id]: {
                  id,
                  name: id,
                  npm: '@ai-sdk/openai-compatible',
                  api: baseUrl,
                  env: [],
                  models: {},
                },
              },
              { authoritativeProviderIds: [id] },
            );
          }
          opts.logger?.warn?.(
            `auto-discovery for "${id}" failed and no cache available (server at ${baseUrl} unreachable?)`,
          );
        }
      },
    ),
  );

  if (cacheDirty) {
    try {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify(cache), 'utf8');
    } catch {
      opts.logger?.debug?.('provider auto-discovery cache write failed');
    }
  }
}

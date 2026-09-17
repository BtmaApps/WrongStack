import * as path from 'node:path';
import { DefaultSecretVault } from '@wrongstack/core/security';
import type { ProviderConfig } from '@wrongstack/core/types';
import { ProviderConfigSnapshots } from '@wrongstack/providers';
import { loadConfigProviders, mutateConfigProviders } from '../provider-config-utils.js';

const snapshots = new ProviderConfigSnapshots();

// Re-export the provider-record transforms the webui handlers need, so
// callers have a single import surface for
// "webui provider config" instead of juggling this module *and*
// ../provider-config-utils.js. The transforms themselves stay in the
// broadly-shared provider-config-utils.js (auth-menu, slash-commands,
// subcommands all use it); this is a facade re-export, not a move.
// PR 4 follow-up of Issue #30.
export {
  expectDefined,
  maskedKey,
  normalizeKeys,
  nowIso,
  writeKeysBack,
} from '../provider-config-utils.js';

/**
 * PR 4 of Issue #30 (webui-server 8-PR refactor):
 * provider-config IO.
 *
 * Before this PR, the two helpers below were inlined
 * at the bottom of `webui-server.ts` as closure-captured
 * helpers that read `opts.globalConfigPath` from the
 * surrounding `runWebUI` scope. The helpers themselves
 * are pure: given a config path and a vault, they
 * load or save the providers map. The `globalConfigPath`
 * closure capture is what made them untestable in
 * isolation.
 *
 * After this PR, the helpers live in their own module
 * with explicit parameters. `runWebUI` is the only
 * caller; it now constructs the helpers at the call
 * site or threads `globalConfigPath` through a thin
 * adapter.
 *
 * Note: `writeKeysBack` and `normalizeKeys` (used by
 * the per-handler key ops) are *already* imported from
 * `@wrongstack/webui-server`. This PR does not move
 * them — they were never inlined in `webui-server.ts`.
 * Per the plan body's update after PR #51, they are
 * not part of this extraction.
 */

export function getVault(globalConfigPath: string | undefined): DefaultSecretVault {
  const configDir = path.dirname(globalConfigPath ?? '');
  const parentDir = path.dirname(configDir);
  const globalRoot = path.basename(parentDir) === 'profiles' ? path.dirname(parentDir) : configDir;
  const keyFile = path.join(globalRoot, '.key');
  return new DefaultSecretVault({ keyFile });
}

export async function loadSavedProviders(
  globalConfigPath: string | undefined,
): Promise<Record<string, ProviderConfig>> {
  if (!globalConfigPath) return {};
  return snapshots.track(await loadConfigProviders(globalConfigPath, getVault(globalConfigPath)));
}

export async function saveProviders(
  globalConfigPath: string | undefined,
  providers: Record<string, ProviderConfig>,
): Promise<void> {
  if (!globalConfigPath) return;
  await mutateConfigProviders(
    globalConfigPath,
    getVault(globalConfigPath),
    (existing: Record<string, ProviderConfig>) => {
      const merged = snapshots.merge(existing, providers);
      for (const key of Object.keys(existing)) delete existing[key];
      Object.assign(existing, merged);
      for (const key of Object.keys(providers)) delete providers[key];
      Object.assign(providers, merged);
    },
  );
  snapshots.track(providers);
}

/**
 * A provider-config store bound to one `globalConfigPath`.
 *
 * PR 4 follow-up of Issue #30: the provider ws-handlers used to take a
 * raw `globalConfigPath` and call `loadSavedProviders`/`saveProviders`
 * with it on every operation. Binding the path once into a small
 * `load`/`save` object (mirrors the standalone server's
 * `createProviderConfigIO`) removes the repeated path threading and
 * gives callers a single dependency to mock.
 */
export interface ProviderConfigStore {
  load(): Promise<Record<string, ProviderConfig>>;
  save(providers: Record<string, ProviderConfig>): Promise<void>;
}

/**
 * Build a {@link ProviderConfigStore} for `globalConfigPath`. When the
 * path is undefined the store is a no-op (load ⇒ `{}`, save ⇒ nothing),
 * matching the underlying helpers' behaviour.
 *
 * @param configProvidersRef Optional callback that returns the in-memory
 *   merged `config.providers` map (from the boot config loader which merges
 *   global + project-local configs). When provided, `load()` returns from
 *   this ref instead of re-reading the single global config file on disk.
 *   This prevents a mismatch where providers stored in the project-local
 *   config (`config.local.json`) are visible to the agent but invisible
 *   to the WebUI's saved-providers panel.
 */
export function createProviderConfigStore(
  globalConfigPath: string | undefined,
  configProvidersRef?: () => Record<string, ProviderConfig>,
): ProviderConfigStore {
  if (configProvidersRef && globalConfigPath) {
    const views = new WeakMap<
      Record<string, ProviderConfig>,
      { view: Record<string, ProviderConfig>; disk: Record<string, ProviderConfig> }
    >();
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    return {
      load: async () => {
        const disk = await loadSavedProviders(globalConfigPath);
        const providers = structuredClone(configProvidersRef());
        views.set(providers, { view: structuredClone(providers), disk });
        return providers;
      },
      save: async (providers) => {
        const baseline = views.get(providers);
        if (!baseline) {
          throw new Error('Load the provider list before saving. Refresh and try again.');
        }
        const pending = structuredClone(baseline.disk);
        snapshots.track(pending);
        for (const id of new Set([...Object.keys(baseline.view), ...Object.keys(providers)])) {
          if (equal(baseline.view[id], providers[id])) continue;
          if (!equal(baseline.view[id], baseline.disk[id])) {
            throw new Error(
              `Provider "${id}" comes from another config file. Edit its source config or create a new auth profile alias.`,
            );
          }
          if (Object.hasOwn(providers, id)) pending[id] = structuredClone(providers[id]!);
          else delete pending[id];
        }
        await saveProviders(globalConfigPath, pending);
        // Preserve inherited rows in the UI, without copying their credentials
        // into the writable file. Include concurrent edits to owned rows.
        for (const id of Object.keys(providers)) {
          if (equal(baseline.view[id], baseline.disk[id])) delete providers[id];
        }
        for (const [id, record] of Object.entries(pending)) {
          if (equal(baseline.view[id], baseline.disk[id])) providers[id] = record;
        }
        views.set(providers, { view: structuredClone(providers), disk: structuredClone(pending) });
      },
    };
  }
  return {
    load: () =>
      configProvidersRef
        ? Promise.resolve(snapshots.track(structuredClone(configProvidersRef())))
        : loadSavedProviders(globalConfigPath),
    save: (providers) => saveProviders(globalConfigPath, providers),
  };
}

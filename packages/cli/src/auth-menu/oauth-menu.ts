import { color } from '@wrongstack/core/utils';
import { loadProviders } from './helpers.js';
import { providerAuthRegistryFor, runProviderAuthLogin } from './provider-auth-login.js';
import type { AuthMenuDeps } from './types.js';

/** Render subscription OAuth login choices shared by the top menu and add flow. */
export function renderOAuthLoginOptions(deps: AuthMenuDeps, indent = '    '): void {
  const entries = providerAuthRegistryFor(deps).list();
  deps.renderer.write(
    `${indent}${color.bold('OAuth login options')} ${color.dim('(browser / device sign-in)')}\n` +
      entries
        .map(
          (entry) =>
            `${indent}${color.bold(entry.id.padEnd(10))} ${entry.label}  ${color.dim(`(→ ${entry.providerId})`)}\n`,
        )
        .join(''),
  );
}

/** Strategy ids are runtime-extensible; this alias preserves the public CLI name. */
export type OAuthMenuKind = string;

/**
 * Normalize a user-typed subscription name to an OAuth kind.
 * `allowNumeric` enables the 1/2/3 menu picks (off for free-text prompts,
 * where a bare digit is far more likely to be a typo than a menu choice).
 */
export function resolveOAuthKind(
  choice: string,
  opts: { allowNumeric?: boolean; deps?: AuthMenuDeps | undefined } = {},
): OAuthMenuKind | undefined {
  const pick = choice.trim().toLowerCase();
  if (!pick) return undefined;
  const registry = opts.deps ? providerAuthRegistryFor(opts.deps) : providerAuthRegistryFor({});
  if (opts.allowNumeric !== false && /^\d+$/.test(pick)) {
    return registry.list()[Number(pick) - 1]?.id;
  }
  return registry.resolveId(pick);
}

/** Run an OAuth login for a normalized menu choice. Returns true when handled. */
export async function runOAuthLoginChoice(
  deps: AuthMenuDeps,
  choice: string,
  opts: { allowNumeric?: boolean } = {},
): Promise<boolean> {
  const kind = resolveOAuthKind(choice, { ...opts, deps });
  if (!kind) return false;
  const sourceId = providerAuthRegistryFor(deps).get(kind)?.providerId ?? kind;
  const profiles = await loadProviders(deps);
  let suggestedAlias = sourceId;
  for (let n = 2; profiles[suggestedAlias]; n++) suggestedAlias = `${sourceId}-${n}`;
  const alias = (
    await deps.reader.readLine(
      `  Auth profile alias [${suggestedAlias}] (existing alias re-authenticates; q cancels): `,
    )
  ).trim();
  if (alias.toLowerCase() !== 'q')
    await runOAuthLoginKind(deps, kind, { providerId: alias || suggestedAlias });
  return true;
}

/** Run the OAuth login flow for an already-resolved kind. */
export async function runOAuthLoginKind(
  deps: AuthMenuDeps,
  kind: OAuthMenuKind,
  opts?: { providerId?: string | undefined },
): Promise<number> {
  return opts ? runProviderAuthLogin(deps, kind, opts) : runProviderAuthLogin(deps, kind);
}

/** Sub-menu: pick a subscription to sign in with (OAuth). */
export async function runOAuthLoginMenu(deps: AuthMenuDeps): Promise<void> {
  const entries = providerAuthRegistryFor(deps).list();
  deps.renderer.write(
    `\n  ${color.bold('Login with OAuth:')}\n` +
      color.amber('  ⚠ Subscription authentication may be governed by provider-specific terms.\n') +
      entries
        .map(
          (entry, index) =>
            `    ${color.bold(String(index + 1))}  ${entry.label}  ${color.dim(`(→ ${entry.providerId})`)}\n`,
        )
        .join(''),
  );
  const pick = await deps.reader.readLine(
    `  ${color.amber('?')} Pick ${color.dim('(or b to go back)')}: `,
  );
  await runOAuthLoginChoice(deps, pick);
}

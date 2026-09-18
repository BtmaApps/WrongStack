/**
 * `wstack typesafe` — the account surface for the System One features.
 *
 * TypeSafe is not a provider and deliberately does not appear in `wstack auth`:
 * it answers typed questions rather than generating text, so putting it in the
 * provider list would leak `jev-latest` into the model picker, the subagent
 * lanes and the fallback chain, where selecting it would simply break a turn.
 * But "not a provider" is not "not an account" — it has a credential, a host
 * and a bill, and until this command existed the only way to configure any of
 * that was to hand-edit a config file. Nothing in any UI mentioned it.
 *
 *   wstack typesafe                  what is configured and whether it works
 *   wstack typesafe login            store a key (and pick a route)
 *   wstack typesafe test             spend one cheap question proving it works
 *
 * `test` is the point of the whole command. Both consumers degrade silently by
 * design, so a wrong or revoked key produces no error anywhere — it produces
 * slightly worse routing and no skill suggestions, forever. This is the only
 * place that asks the host directly and reports what it said.
 */

import {
  BUILT_IN_ROUTES,
  estimateTypeSafeCostUsd,
  isTypeSafeRoute,
  resolveTypeSafeAccount,
  resolveTypeSafeRoute,
  TYPESAFE_ROUTES,
  type TypeSafeRoute,
} from '@wrongstack/core/typesafe';
import { color } from '@wrongstack/core/utils';
import { activeProfileConfigPath } from '../../profile-config-path.js';
import { maskedKey, mutateConfigProviders } from '../../provider-config-utils.js';
import type { SubcommandDeps, SubcommandHandler } from '../contracts.js';

const USAGE = [
  'Usage:',
  '  wstack typesafe [status]                 show the account and whether it works',
  '  wstack typesafe login [--route <id>]     store an API key in the active profile',
  '  wstack typesafe test                     send one question and report the answer',
  '',
  `Routes: ${BUILT_IN_ROUTES.map((r) => `${r} (${TYPESAFE_ROUTES[r].env})`).join(', ')}, custom (typesafe.endpoint)`,
  '',
  'TypeSafe is not a chat provider and is not listed by `wstack auth`.',
].join('\n');

export const typesafeCmd: SubcommandHandler = async (args, deps) => {
  const write = (line: string): void => deps.renderer.write(`${line}\n`);
  const flags = deps.flags ?? {};
  if (flags['help'] === true || flags['h'] === true) {
    write(USAGE);
    return 0;
  }

  const sub = (args[0] ?? 'status').toLowerCase();
  switch (sub) {
    case 'status':
      return showStatus(deps, write);
    case 'login':
      return await login(deps, write);
    case 'test':
      return await test(deps, write);
    default:
      write(`Unknown subcommand: ${sub}\n`);
      write(USAGE);
      return 1;
  }
};

/** Features that consume the account, and the switch that turns each one on. */
function requestedFeatures(deps: SubcommandDeps): string[] {
  const requested: string[] = [];
  if (deps.config.skills?.suggest?.enabled === true) requested.push('skills.suggest');
  if (deps.config.fleet?.dispatch?.typesafeClassifier === true) {
    requested.push('fleet.dispatch.typesafeClassifier');
  }
  return requested;
}

function showStatus(deps: SubcommandDeps, write: (line: string) => void): number {
  const account = resolveTypeSafeAccount({ config: deps.config });
  const route = resolveTypeSafeRoute(deps.config, process.env);
  const features = requestedFeatures(deps);

  write(color.bold('TypeSafe account'));
  write(`  route      ${route}${route === 'custom' ? color.dim(' (from typesafe.endpoint)') : ''}`);

  if (account.status === 'ready') {
    write(`  endpoint   ${account.endpoint}`);
    write(`  model      ${account.model}`);
    write(
      `  key        ${
        account.keySource === 'config'
          ? `${maskedKey(deps.config.typesafe?.apiKey ?? '')} ${color.dim('(typesafe.apiKey)')}`
          : color.dim(`from $${account.keyEnv}`)
      }`,
    );
  } else {
    write(`  key        ${color.dim('—')}`);
    write(`  ${color.amber('!')} ${account.reason}`);
  }

  write('');
  write(color.bold('Features'));
  if (features.length === 0) {
    // Not a problem to fix: an account with nothing switched on is a perfectly
    // ordinary state, and this command is also how someone checks a key before
    // turning anything on.
    write(`  ${color.dim('none enabled')} — see docs/skills-suggestion.md`);
  } else {
    for (const feature of features) {
      write(
        account.status === 'ready'
          ? `  ${color.green('on')}  ${feature}`
          : `  ${color.amber('on, but not running')}  ${feature}`,
      );
    }
  }

  if (account.status !== 'ready' && features.length > 0) {
    write('');
    write(`  ${color.amber('Run `wstack typesafe login` — these switches do nothing today.')}`);
    return 1;
  }
  return 0;
}

async function login(deps: SubcommandDeps, write: (line: string) => void): Promise<number> {
  const flags = deps.flags ?? {};
  const requested = flags['route'];
  let route: TypeSafeRoute | undefined;
  if (typeof requested === 'string') {
    if (!isTypeSafeRoute(requested)) {
      write(`Unknown route: ${requested}`);
      write(USAGE);
      return 1;
    }
    route = requested;
  }

  const label = route && route !== 'custom' ? TYPESAFE_ROUTES[route].label : 'TypeSafe';
  const fromFlag = typeof flags['key'] === 'string' ? flags['key'].trim() : '';
  // `readSecret` keeps the key off the screen and out of shell history. The
  // `--key` flag exists for provisioning scripts and is the caller's choice to
  // put a secret on a command line, not ours.
  const key =
    fromFlag || (await deps.reader.readSecret(`  ${color.amber('?')} ${label} API key: `));
  if (!key.trim()) {
    write('No key entered; nothing written.');
    return 1;
  }

  // Written through the same vault-aware, locked, atomic config mutation the
  // provider keys use. The helper is named for providers because that was its
  // first caller, but its job is "mutate the profile config safely" and a
  // second implementation of that would be a second place to get encryption,
  // locking or corruption handling wrong. `typesafe.apiKey` is encrypted on
  // write by `encryptConfigSecrets` because the field name matches
  // `isSecretField` — this is exactly why the field must keep that name.
  const configPath = activeProfileConfigPath(deps.paths, deps.config);
  await mutateConfigProviders(configPath, deps.vault, (_providers, config) => {
    const existing =
      typeof config['typesafe'] === 'object' && config['typesafe'] !== null
        ? (config['typesafe'] as Record<string, unknown>)
        : {};
    existing['apiKey'] = key.trim();
    if (route) existing['route'] = route;
    config['typesafe'] = existing;
  });

  write(`${color.green('✓')} Key stored in ${configPath}`);
  if (route) write(`  route set to ${route}`);
  write(`  Verify it with ${color.bold('wstack typesafe test')}.`);
  return 0;
}

async function test(deps: SubcommandDeps, write: (line: string) => void): Promise<number> {
  const account = resolveTypeSafeAccount({ config: deps.config });
  if (account.status !== 'ready') {
    write(`${color.red('✗')} ${account.reason}`);
    write('  Run `wstack typesafe login`.');
    return 1;
  }

  write(`Asking ${account.endpoint} (${account.model})…`);
  const started = Date.now();
  try {
    // One Noul with an unambiguous answer. The point is not the judgment — it
    // is that the credential, the route, the model id and the response shape
    // all work end to end, which nothing else in the system ever proves.
    const result = await account.client.systemOne({
      state: { text: 'The service returned this request successfully.' },
      questions: {
        reachable: {
          type: 'noul',
          instructions: 'Is the text in the state written in English?',
        },
      },
    });
    const answer = result.answers['reachable'];
    const elapsed = Date.now() - started;
    if (answer?.type !== 'noul') {
      // A 200 whose body does not carry the answer we asked for is a real
      // failure — and the exact one the client is built to swallow, because a
      // live turn is better off with no suggestion than with a thrown shape.
      write(`${color.red('✗')} Reached the host but the answer was missing or malformed.`);
      return 1;
    }
    write(`${color.green('✓')} ${account.route} route works — answered in ${elapsed}ms`);
    write(`  model reported  ${result.model ?? color.dim('(none in response)')}`);
    write(
      `  cost            ${result.usage.inputTokens} input tokens ` +
        color.dim(`(~$${estimateTypeSafeCostUsd(result.usage.inputTokens).toFixed(6)})`),
    );
    if (
      result.model &&
      deps.config.typesafe?.model &&
      result.model !== deps.config.typesafe.model
    ) {
      // `jev-latest` is an alias. Saying which version answered is the only
      // way a calibrated threshold can be tied to what it was calibrated on.
      write(
        color.dim(`  note: asked for ${deps.config.typesafe.model}, answered by ${result.model}`),
      );
    }
    return 0;
  } catch (err) {
    const status = (err as { status?: number }).status;
    write(`${color.red('✗')} ${err instanceof Error ? err.message : String(err)}`);
    if (status === 401 || status === 403) {
      write('  The host rejected the key. Re-run `wstack typesafe login`.');
    } else if (status === 429 || status === 529) {
      write('  Rate limited or overloaded — the key is probably fine; try again shortly.');
    } else if (status === 422) {
      write('  The host rejected the request shape, not the key. This is a bug; please report it.');
    }
    return 1;
  }
}

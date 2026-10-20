import { existsSync, realpathSync } from 'node:fs';
import { isStandaloneBinary } from '@wrongstack/core/utils';
import type { TerminalRenderer } from '../../renderer.js';
import { checkForUpdate, type UpdatePackageName } from '../../update-check.js';
import type { SubcommandDeps, SubcommandHandler } from '../contracts.js';

interface UpdateCommandDeps {
  cwd: string;
  userHome: string;
  renderer: Pick<TerminalRenderer, 'write'>;
  flags?: SubcommandDeps['flags'] | undefined;
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function parsePackageManager(value: string | undefined): PackageManager | undefined {
  return value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun'
    ? value
    : undefined;
}

/** Updates always come from GitHub Releases, including migration from package installs. */
export async function runUpdateCommand(args: string[], deps: UpdateCommandDeps): Promise<number> {
  const flags = deps.flags ?? {};
  if (args.includes('--help') || flags['help'] === true || flags['help'] === 'true') {
    deps.renderer.write(
      'Usage: wstack update [--check-only]\nUpdates from GitHub Releases; legacy package installs migrate to the standalone binary.\n',
    );
    return 0;
  }
  const supported = [
    'check-only',
    'c',
    'continue',
    'pm',
    'package-manager',
    'allow-scripts',
    'lifecycle-scripts',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'no-banner',
    'verbose',
    'trace',
  ];
  const unknown = Object.keys(flags).find((flag) => !supported.includes(flag));
  if (unknown) {
    deps.renderer.write(`Unknown update option: --${unknown}\n`);
    return 1;
  }
  let legacyOptions = Object.keys(flags).some((flag) =>
    [
      'pm',
      'package-manager',
      'npm',
      'pnpm',
      'yarn',
      'bun',
      'allow-scripts',
      'lifecycle-scripts',
    ].includes(flag),
  );
  let checkOnly = ['check-only', 'c', 'continue'].some(
    (flag) => flags[flag] === true || flags[flag] === 'true',
  );
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--check-only' || arg === '-c') checkOnly = true;
    else if (arg === '--pm' || arg === '--package-manager') {
      if (!['npm', 'pnpm', 'yarn', 'bun'].includes(args[++i] ?? '')) {
        deps.renderer.write(
          'Invalid package manager (legacy option; package updates are disabled).\n',
        );
        return 1;
      }
      legacyOptions = true;
    } else if (
      /^--(?:pm|package-manager)=(npm|pnpm|yarn|bun)$/.test(arg) ||
      /^--(?:npm|pnpm|yarn|bun|allow-scripts|lifecycle-scripts)$/.test(arg)
    )
      legacyOptions = true;
    else {
      deps.renderer.write(`Unknown update option: ${arg}\n`);
      return 1;
    }
  }
  if (legacyOptions)
    deps.renderer.write(
      'Warning: package-manager and lifecycle-script options are ignored. Updates use GitHub Releases only.\n',
    );
  const standalone = isStandaloneBinary();
  if (!standalone)
    deps.renderer.write(
      'Warning: this is a legacy package installation. WrongStack will never update through npm, pnpm, yarn or Bun. A GitHub Releases binary will be installed first, then old global wrongstack / @wrongstack/cli packages will be uninstalled.\n',
    );
  const info = await checkForUpdate({
    source: 'github-releases',
    forceRefresh: true,
    homeFn: () => deps.userHome,
  });
  if (info.checkFailed) {
    deps.renderer.write(
      'Update check failed for GitHub Releases. Check your internet connection and try again.\n',
    );
    return 1;
  }
  if (checkOnly) {
    deps.renderer.write(
      info.outdated
        ? `Update available: v${info.current} → v${info.latest}\n`
        : `You are on the latest version: v${info.current}\n`,
    );
    if (!standalone)
      deps.renderer.write(
        'Run wstack update to migrate this package installation to the standalone binary.\n',
      );
    return 0;
  }
  // A current npm package still needs migration; only binaries can skip installation.
  if (!standalone) {
    const { migrateToStandalone } = await import('../../standalone-migration.js');
    return migrateToStandalone({
      version: info.latest,
      userHome: deps.userHome,
      renderer: deps.renderer,
    });
  }
  if (!info.outdated) {
    deps.renderer.write(`You are already on the latest version: v${info.current}\n`);
    return 0;
  }
  const [{ updateStandaloneBinary }, { standaloneUpdater }, { STANDALONE_TARGET }] =
    await Promise.all([
      import('../../standalone-update.js'),
      import('../../standalone-auto-update.js'),
      import('../../version.js'),
    ]);
  const updater = standaloneUpdater({
    executable: realpathSync(process.execPath),
    target: STANDALONE_TARGET ?? '',
    current: info.current,
  });
  const code = await updateStandaloneBinary({
    current: info.current,
    renderer: deps.renderer,
    staged: updater.pending(),
  });
  if (code === 0) updater.clear();
  return code;
}

export const updateCmd: SubcommandHandler = async (args, deps) => runUpdateCommand(args, deps);

export function detectUpdatePackageManager(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
): PackageManager {
  const forced = parsePackageManager(env.WRONGSTACK_UPDATE_PM);
  if (forced) return forced;

  const userAgent = env.npm_config_user_agent ?? '';
  if (/\bpnpm\//i.test(userAgent)) return 'pnpm';
  if (/\byarn\//i.test(userAgent)) return 'yarn';
  if (/\bbun\//i.test(userAgent)) return 'bun';
  if (/\bnpm\//i.test(userAgent)) return 'npm';

  const execPath = `${env.npm_execpath ?? ''} ${argv[1] ?? ''}`;
  const realPaths = [env.npm_execpath, argv[1]]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => {
      try {
        return existsSync(p) ? realpathSync(p) : p;
      } catch {
        return p;
      }
    })
    .join(' ');
  const hint = `${execPath} ${realPaths}`.replace(/\\/g, '/').toLowerCase();
  if (hint.includes('/pnpm/') || hint.includes('/.pnpm/') || hint.includes('pnpm-global'))
    return 'pnpm';
  if (hint.includes('/yarn/') || hint.includes('/.yarn/')) return 'yarn';
  if (hint.includes('/bun/') || hint.includes('/.bun/')) return 'bun';
  return 'npm';
}

/** Detect whether the running binary belongs to the umbrella or direct CLI package. */
export function detectUpdatePackageName(argv: string[] = process.argv): UpdatePackageName {
  const entry = (argv[1] ?? '').replace(/\\/g, '/').toLowerCase();
  return entry.includes('/node_modules/@wrongstack/cli/') || entry.includes('/packages/cli/dist/')
    ? '@wrongstack/cli'
    : 'wrongstack';
}

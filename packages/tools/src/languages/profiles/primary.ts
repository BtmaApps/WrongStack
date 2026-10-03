import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { internalPlan, packageNames, processPlan, unavailable } from '../profile-helpers.js';
import type { LanguageOperation, LanguageProfile, ProfileContext } from '../types.js';

const COMMON_IGNORES = Object.freeze([
  '.git',
  '.wrongstack',
  'node_modules',
  'vendor',
  'target',
  'bin',
  'obj',
  'dist',
  'build',
  'coverage',
]);

function nodeManager(ctx: ProfileContext): string | undefined {
  const lockfiles = new Set(
    ctx.workspace.evidence
      .filter((evidence) => evidence.kind === 'lockfile')
      .map((evidence) => evidence.value.toLowerCase()),
  );
  if (lockfiles.size > 1 && !ctx.workspace.packageManager) return undefined;
  return ctx.workspace.packageManager ?? 'npm';
}

function scriptPlan(ctx: ProfileContext, operation: string, script: string) {
  const manager = nodeManager(ctx);
  if (!manager)
    return unavailable(
      ctx,
      operation as LanguageOperation,
      'Conflicting Node lockfiles make the package manager ambiguous.',
    );
  const args = manager === 'npm' ? ['run', script] : [script];
  return processPlan(ctx, operation as LanguageOperation, manager, args, {
    parser: 'command-text',
    reason: `Run the detected ${manager} ${script} script for this workspace.`,
    mutating: true,
    executesProjectCode: true,
  });
}

/** The named packages, or `fallback` when none were given. */
function orAll(names: readonly string[], fallback: readonly string[]): readonly string[] {
  return names.length > 0 ? names : fallback;
}

/** True when the caller opted in to package lifecycle scripts (`allowScripts`). */
function scriptsAllowed(ctx: ProfileContext): boolean {
  return ctx.options.allowScripts === true;
}

/** Plan wording for whether lifecycle scripts run. */
function scriptsNote(ctx: ProfileContext): string {
  return scriptsAllowed(ctx)
    ? 'lifecycle scripts ENABLED (allowScripts)'
    : 'lifecycle scripts disabled';
}

/**
 * The "no lifecycle scripts" argument — none when the caller opted in with
 * `allowScripts: true`. Yarn 2+ has no `--ignore-scripts` ("Unsupported option
 * name"); its equivalent is `--mode=skip-build`. Berry is selected by
 * `packageManager: "yarn@2+"` or a `.yarnrc.yml` in the workspace.
 */
async function noScriptsArgs(ctx: ProfileContext, manager: string): Promise<string[]> {
  if (scriptsAllowed(ctx)) return [];
  return [
    manager === 'yarn' && (await isYarnBerry(ctx)) ? '--mode=skip-build' : '--ignore-scripts',
  ];
}

/** Composer's spelling of the same opt-out. */
function composerNoScripts(ctx: ProfileContext): string[] {
  return scriptsAllowed(ctx) ? [] : ['--no-scripts'];
}

async function isYarnBerry(ctx: ProfileContext): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(ctx.workspace.root, 'package.json'), 'utf8'));
    const major = /^yarn@(\d+)/.exec(String(manifest?.packageManager ?? ''))?.[1];
    if (major) return Number(major) >= 2;
  } catch {
    // no/invalid package.json — fall back to the .yarnrc.yml signal
  }
  return access(join(ctx.workspace.root, '.yarnrc.yml')).then(
    () => true,
    () => false,
  );
}

function nodeExec(ctx: ProfileContext, executable: string, args: readonly string[]) {
  const manager = ctx.workspace.packageManager ?? 'npm';
  if (manager === 'pnpm') return { command: 'pnpm', args: ['exec', executable, ...args] };
  if (manager === 'yarn') return { command: 'yarn', args: ['exec', executable, ...args] };
  // `bun x` installs a missing binary from the registry (`bun x tsc` would
  // fetch the unrelated npm package named `tsc`); `--no-install` keeps it to
  // the project's own bin, like `npx --no-install` below.
  if (manager === 'bun') {
    return { command: 'bun', args: ['x', '--no-install', executable, ...args] };
  }
  return { command: 'npx', args: ['--no-install', executable, ...args] };
}

function typescriptProfile(): LanguageProfile {
  return {
    id: 'typescript',
    displayName: 'TypeScript',
    extensions: Object.freeze(['.ts', '.tsx', '.mts', '.cts']),
    lspLanguageIds: Object.freeze(['typescript', 'typescriptreact']),
    detectors: Object.freeze([
      { kind: 'config', filename: 'tsconfig.json', weight: 90 },
      { kind: 'manifest', filename: 'package.json', weight: 55 },
      { kind: 'lockfile', filename: 'pnpm-lock.yaml', weight: 30 },
      { kind: 'lockfile', filename: 'yarn.lock', weight: 30 },
      { kind: 'lockfile', filename: 'package-lock.json', weight: 30 },
      { kind: 'lockfile', filename: 'bun.lock', weight: 30 },
      { kind: 'lockfile', filename: 'bun.lockb', weight: 30 },
    ]),
    ignoredDirectories: COMMON_IGNORES,
    packageManagers: Object.freeze(['pnpm', 'yarn', 'bun', 'npm']),
    executables: Object.freeze(['pnpm', 'yarn', 'bun', 'npx', 'npm']),
    operations: Object.freeze({
      syntax: async (ctx) =>
        internalPlan(
          ctx,
          'syntax',
          'typescript-parser',
          'Parse the target with the TypeScript compiler API.',
        ),
      semantic: async (ctx) => {
        const run = nodeExec(ctx, 'tsc', ['--noEmit', '--pretty', 'false']);
        return processPlan(ctx, 'semantic', run.command, run.args, {
          parser: 'typescript',
          reason: 'Run the workspace TypeScript compiler without emitting files.',
          executesProjectCode: true,
        });
      },
      lint: async (ctx) => {
        // github reporter: one line per finding with its real severity/message.
        const run = nodeExec(ctx, 'biome', ['lint', '--reporter=github', '.']);
        return processPlan(ctx, 'lint', run.command, run.args, {
          parser: 'biome',
          reason: 'Run the project-local Biome linter.',
          executesProjectCode: true,
        });
      },
      'format-check': async (ctx) => {
        // `biome format` without --write IS the check; biome has no `--check`
        // flag and refuses it ("`--check` is not expected in this context").
        const run = nodeExec(ctx, 'biome', ['format', '--reporter=github', '.']);
        return processPlan(ctx, 'format-check', run.command, run.args, {
          parser: 'biome',
          reason: 'Check formatting with the project-local Biome formatter.',
          executesProjectCode: true,
        });
      },
      'format-write': async (ctx) => {
        const run = nodeExec(ctx, 'biome', ['format', '--write', '.']);
        return processPlan(ctx, 'format-write', run.command, run.args, {
          parser: 'biome',
          reason: 'Format the workspace with the project-local Biome formatter.',
          mutating: true,
          executesProjectCode: true,
        });
      },
      test: async (ctx) =>
        ctx.options.filter || ctx.options.coverage
          ? unavailable(
              ctx,
              'test',
              'The detected package script does not expose deterministic filter or coverage adapters.',
            )
          : scriptPlan(ctx, 'test', 'test'),
      build: async (ctx) => scriptPlan(ctx, 'build', 'build'),
      run: async (ctx) => scriptPlan(ctx, 'run', 'dev'),
      'debug-compile': async (ctx) => {
        const run = nodeExec(ctx, 'tsc', ['--noEmit', '--pretty', 'false']);
        return processPlan(ctx, 'debug-compile', run.command, run.args, {
          parser: 'typescript',
          reason: 'Collect deterministic TypeScript compiler diagnostics.',
          executesProjectCode: true,
        });
      },
      'package-install': async (ctx) => {
        const manager = ctx.workspace.packageManager ?? 'npm';
        const args = ['install', ...(await noScriptsArgs(ctx, manager))];
        return processPlan(ctx, 'package-install', manager, args, {
          parser: 'package-text',
          reason: `Restore declared dependencies with ${manager} and ${scriptsNote(ctx)}.`,
          mutating: true,
          network: true,
          executesProjectCode: scriptsAllowed(ctx),
        });
      },
      'package-add': async (ctx) => {
        const names = packageNames(ctx);
        if (names.length === 0)
          return unavailable(ctx, 'package-add', 'At least one package name is required.');
        const manager = ctx.workspace.packageManager ?? 'npm';
        // `scope` decides the manifest section: npm/pnpm spell it --save-dev /
        // --save-optional, yarn/bun --dev / --optional.
        const scope = ctx.options.packageScope;
        const savePrefix = manager === 'npm' || manager === 'pnpm' ? '--save-' : '--';
        const scopeFlags =
          scope === 'development'
            ? [`${savePrefix}dev`]
            : scope === 'optional'
              ? [`${savePrefix}optional`]
              : [];
        const noScripts = await noScriptsArgs(ctx, manager);
        const args =
          manager === 'npm'
            ? ['install', ...noScripts, ...scopeFlags, ...names]
            : ['add', ...noScripts, ...scopeFlags, ...names];
        return processPlan(ctx, 'package-add', manager, args, {
          parser: 'package-text',
          reason: `Add validated packages with ${manager} and ${scriptsNote(ctx)}.`,
          mutating: true,
          network: true,
          executesProjectCode: scriptsAllowed(ctx),
        });
      },
      'package-remove': async (ctx) => {
        const names = packageNames(ctx);
        if (names.length === 0)
          return unavailable(ctx, 'package-remove', 'At least one package name is required.');
        const manager = ctx.workspace.packageManager ?? 'npm';
        const noScripts = await noScriptsArgs(ctx, manager);
        const args =
          manager === 'npm'
            ? ['uninstall', ...noScripts, ...names]
            : ['remove', ...noScripts, ...names];
        return processPlan(ctx, 'package-remove', manager, args, {
          parser: 'package-text',
          reason: `Remove validated packages with ${manager} and ${scriptsNote(ctx)}.`,
          mutating: true,
          network: true,
          executesProjectCode: scriptsAllowed(ctx),
        });
      },
      'package-audit': async (ctx) => {
        const manager = ctx.workspace.packageManager ?? 'npm';
        // Yarn 2+ has no `audit` ("Couldn't find a script named audit"); its
        // auditor is `yarn npm audit`.
        const args =
          manager === 'yarn' && (await isYarnBerry(ctx))
            ? ['npm', 'audit', '--json']
            : ['audit', '--json'];
        return processPlan(ctx, 'package-audit', manager, args, {
          parser: 'npm-audit',
          reason: `Audit dependencies with the detected ${manager} package manager.`,
          network: true,
        });
      },
      'package-outdated': async (ctx) => {
        const manager = ctx.workspace.packageManager ?? 'npm';
        return processPlan(ctx, 'package-outdated', manager, ['outdated', '--json'], {
          parser: 'npm-outdated',
          reason: `Check outdated dependencies with ${manager}.`,
          network: true,
        });
      },
    }),
  };
}

function javascriptProfile(): LanguageProfile {
  const ts = typescriptProfile();
  return {
    ...ts,
    id: 'javascript',
    displayName: 'JavaScript',
    extensions: Object.freeze(['.js', '.jsx', '.mjs', '.cjs']),
    lspLanguageIds: Object.freeze(['javascript', 'javascriptreact']),
    detectors: Object.freeze([
      { kind: 'config', filename: 'jsconfig.json', weight: 90 },
      { kind: 'manifest', filename: 'package.json', weight: 70 },
      { kind: 'lockfile', filename: 'pnpm-lock.yaml', weight: 30 },
      { kind: 'lockfile', filename: 'yarn.lock', weight: 30 },
      { kind: 'lockfile', filename: 'package-lock.json', weight: 30 },
      { kind: 'lockfile', filename: 'bun.lock', weight: 30 },
      { kind: 'lockfile', filename: 'bun.lockb', weight: 30 },
    ]),
    operations: Object.freeze({
      ...ts.operations,
      syntax: async (ctx: ProfileContext) =>
        internalPlan(
          ctx,
          'syntax',
          'typescript-parser',
          'Parse JavaScript with the TypeScript compiler API.',
        ),
    }),
  };
}

const goProfile: LanguageProfile = {
  id: 'go',
  displayName: 'Go',
  extensions: Object.freeze(['.go']),
  lspLanguageIds: Object.freeze(['go']),
  detectors: Object.freeze([
    { kind: 'manifest', filename: 'go.mod', weight: 90 },
    { kind: 'manifest', filename: 'go.work', weight: 95 },
    { kind: 'lockfile', filename: 'go.sum', weight: 30 },
  ]),
  ignoredDirectories: COMMON_IGNORES,
  packageManagers: Object.freeze(['go']),
  executables: Object.freeze(['go', 'gofmt']),
  operations: Object.freeze({
    syntax: async (ctx) => {
      if (!ctx.target)
        return unavailable(ctx, 'syntax', 'Go syntax planning requires a target file.');
      // `-l`, not `-d`: gofmt -d exits 1 whenever it prints a FORMAT diff, so
      // valid-but-unformatted code failed the syntax check. With -l a valid
      // file exits 0 and a syntax error still exits 2 with its diagnostics.
      return processPlan(ctx, 'syntax', 'gofmt', ['-e', '-l', ctx.target], {
        parser: 'gofmt',
        reason: 'Parse the target and report syntax errors without writing it.',
      });
    },
    semantic: async (ctx) =>
      processPlan(ctx, 'semantic', 'go', ['test', '-run', '^$', './...'], {
        parser: 'go-test',
        reason: 'Compile all Go packages without selecting tests.',
        mutating: true,
        executesProjectCode: true,
      }),
    lint: async (ctx) =>
      processPlan(ctx, 'lint', 'go', ['vet', './...'], {
        parser: 'go-compiler',
        reason: 'Run the standard Go vet checks.',
        mutating: true,
        executesProjectCode: true,
      }),
    'format-check': async (ctx) =>
      ctx.target
        ? processPlan(ctx, 'format-check', 'gofmt', ['-d', ctx.target], {
            parser: 'gofmt',
            reason: 'Report Go formatting differences for the target without writing it.',
          })
        : unavailable(ctx, 'format-check', 'Go formatting requires an explicit target file.'),
    'format-write': async (ctx) =>
      ctx.target
        ? processPlan(ctx, 'format-write', 'gofmt', ['-w', ctx.target], {
            parser: 'gofmt',
            reason: 'Format the target Go source file.',
            mutating: true,
          })
        : unavailable(ctx, 'format-write', 'Go formatting requires an explicit target file.'),
    test: async (ctx) =>
      processPlan(
        ctx,
        'test',
        'go',
        ['test', ...(ctx.options.filter ? ['-run', ctx.options.filter] : []), './...'],
        {
          parser: 'go-test',
          reason: ctx.options.filter ? 'Run filtered Go tests.' : 'Run all Go tests.',
          mutating: true,
          executesProjectCode: true,
        },
      ),
    build: async (ctx) =>
      processPlan(ctx, 'build', 'go', ['build', './...'], {
        parser: 'go-compiler',
        reason: 'Build all Go packages.',
        mutating: true,
        executesProjectCode: true,
      }),
    run: async (ctx) =>
      processPlan(ctx, 'run', 'go', ['run', '.'], {
        parser: 'command-text',
        reason: 'Run the Go module entry point.',
        executesProjectCode: true,
      }),
    'debug-race': async (ctx) =>
      processPlan(ctx, 'debug-race', 'go', ['test', '-race', './...'], {
        parser: 'go-test',
        reason: 'Collect Go race-detector evidence.',
        mutating: true,
        executesProjectCode: true,
      }),
    'package-install': async (ctx) =>
      processPlan(ctx, 'package-install', 'go', ['mod', 'download'], {
        parser: 'go-module',
        reason: 'Download the dependencies declared by go.mod.',
        mutating: true,
        network: true,
      }),
    'package-add': async (ctx) => {
      const names = packageNames(ctx);
      if (names.length === 0)
        return unavailable(ctx, 'package-add', 'At least one Go module is required.');
      return processPlan(ctx, 'package-add', 'go', ['get', ...names], {
        parser: 'go-module',
        reason: 'Add validated Go modules.',
        mutating: true,
        network: true,
      });
    },
    // Named modules update only those; without names, every package's deps.
    'package-update': async (ctx) =>
      processPlan(
        ctx,
        'package-update',
        'go',
        ['get', '-u', ...orAll(packageNames(ctx), ['./...'])],
        {
          parser: 'go-module',
          reason: 'Update dependencies of all Go packages.',
          mutating: true,
          network: true,
        },
      ),
  }),
};

const rustProfile: LanguageProfile = {
  id: 'rust',
  displayName: 'Rust',
  extensions: Object.freeze(['.rs']),
  lspLanguageIds: Object.freeze(['rust']),
  detectors: Object.freeze([
    { kind: 'manifest', filename: 'Cargo.toml', weight: 90 },
    { kind: 'lockfile', filename: 'Cargo.lock', weight: 30 },
  ]),
  ignoredDirectories: COMMON_IGNORES,
  packageManagers: Object.freeze(['cargo']),
  executables: Object.freeze(['cargo']),
  operations: Object.freeze({
    syntax: async (ctx) =>
      processPlan(ctx, 'syntax', 'cargo', ['check', '--message-format=json'], {
        parser: 'cargo-json',
        reason: 'Check Rust syntax and semantics with Cargo.',
        mutating: true,
        executesProjectCode: true,
      }),
    semantic: async (ctx) =>
      processPlan(ctx, 'semantic', 'cargo', ['check', '--message-format=json'], {
        parser: 'cargo-json',
        reason: 'Collect Rust compiler diagnostics with Cargo check.',
        mutating: true,
        executesProjectCode: true,
      }),
    lint: async (ctx) =>
      processPlan(ctx, 'lint', 'cargo', ['clippy', '--message-format=json'], {
        parser: 'cargo-json',
        reason: 'Run Clippy for this crate.',
        mutating: true,
        executesProjectCode: true,
      }),
    'format-check': async (ctx) =>
      processPlan(ctx, 'format-check', 'cargo', ['fmt', '--check'], {
        parser: 'cargo-fmt',
        reason: 'Check Rust formatting without writing files.',
      }),
    'format-write': async (ctx) =>
      processPlan(ctx, 'format-write', 'cargo', ['fmt'], {
        parser: 'cargo-fmt',
        reason: 'Format Rust source files in the workspace.',
        mutating: true,
      }),
    'test-compile': async (ctx) =>
      processPlan(ctx, 'test-compile', 'cargo', ['test', '--no-run', '--message-format=json'], {
        parser: 'cargo-json',
        reason: 'Compile Rust tests without running them.',
        mutating: true,
        executesProjectCode: true,
      }),
    test: async (ctx) =>
      processPlan(
        ctx,
        'test',
        'cargo',
        ['test', ...(ctx.options.filter ? [ctx.options.filter] : [])],
        {
          parser: 'cargo-test',
          reason: ctx.options.filter ? 'Run filtered Rust tests.' : 'Run Rust tests.',
          mutating: true,
          executesProjectCode: true,
        },
      ),
    build: async (ctx) =>
      processPlan(ctx, 'build', 'cargo', ['build', '--message-format=json'], {
        parser: 'cargo-json',
        reason: 'Build the Rust workspace.',
        mutating: true,
        executesProjectCode: true,
      }),
    run: async (ctx) =>
      processPlan(ctx, 'run', 'cargo', ['run'], {
        parser: 'command-text',
        reason: 'Run the Rust workspace entry point.',
        executesProjectCode: true,
      }),
    // `--locked` pins the fetch to an existing Cargo.lock; with none (a library
    // that does not commit one) cargo refuses to create it and fetches nothing.
    'package-install': async (ctx) => {
      const locked = await ctx.pathExists('Cargo.lock');
      return processPlan(
        ctx,
        'package-install',
        'cargo',
        locked ? ['fetch', '--locked'] : ['fetch'],
        {
          parser: 'cargo-json',
          reason: locked
            ? 'Fetch locked Rust dependencies.'
            : 'Fetch Rust dependencies (no Cargo.lock yet — cargo resolves and writes one).',
          mutating: true,
          network: true,
        },
      );
    },
    'package-add': async (ctx) => {
      const names = packageNames(ctx);
      return names.length === 0
        ? unavailable(ctx, 'package-add', 'At least one crate is required.')
        : processPlan(
            ctx,
            'package-add',
            'cargo',
            [
              'add',
              ...(ctx.options.packageScope === 'development' ? ['--dev'] : []),
              ...(ctx.options.packageScope === 'optional' ? ['--optional'] : []),
              ...names,
            ],
            {
              parser: 'cargo-text',
              reason: 'Add validated Rust crates.',
              mutating: true,
              network: true,
            },
          );
    },
    'package-remove': async (ctx) => {
      const names = packageNames(ctx);
      return names.length === 0
        ? unavailable(ctx, 'package-remove', 'At least one crate is required.')
        : processPlan(ctx, 'package-remove', 'cargo', ['remove', ...names], {
            parser: 'cargo-text',
            reason: 'Remove validated Rust crates.',
            mutating: true,
          });
    },
    // A bare `cargo update` re-resolves EVERY crate; `-p` limits it to the named ones.
    'package-update': async (ctx) =>
      processPlan(
        ctx,
        'package-update',
        'cargo',
        ['update', ...packageNames(ctx).flatMap((name) => ['-p', name])],
        {
          parser: 'cargo-text',
          reason: 'Update the Cargo lockfile.',
          mutating: true,
          network: true,
        },
      ),
    'package-audit': async (ctx) =>
      processPlan(ctx, 'package-audit', 'cargo', ['audit', '--json'], {
        parser: 'cargo-audit',
        reason: 'Audit Rust dependencies when cargo-audit is installed.',
        network: true,
      }),
  }),
};

const phpProfile: LanguageProfile = {
  id: 'php',
  displayName: 'PHP',
  extensions: Object.freeze(['.php']),
  lspLanguageIds: Object.freeze(['php']),
  detectors: Object.freeze([
    { kind: 'manifest', filename: 'composer.json', weight: 90 },
    { kind: 'lockfile', filename: 'composer.lock', weight: 30 },
    { kind: 'config', filename: 'phpunit.xml', weight: 25 },
    { kind: 'config', filename: 'phpunit.xml.dist', weight: 25 },
  ]),
  ignoredDirectories: COMMON_IGNORES,
  packageManagers: Object.freeze(['composer']),
  executables: Object.freeze(['php', 'composer']),
  operations: Object.freeze({
    syntax: async (ctx) =>
      ctx.target
        ? processPlan(ctx, 'syntax', 'php', ['-l', ctx.target], {
            parser: 'php-lint',
            reason: 'Lint the target PHP file without executing it.',
          })
        : unavailable(ctx, 'syntax', 'PHP syntax planning requires a target file.'),
    semantic: async (ctx) =>
      unavailable(
        ctx,
        'semantic',
        'No configured PHPStan or Psalm adapter was detected in Phase 1.',
      ),
    test: async (ctx) =>
      processPlan(
        ctx,
        'test',
        'php',
        ['vendor/bin/phpunit', ...(ctx.options.filter ? ['--filter', ctx.options.filter] : [])],
        {
          parser: 'phpunit',
          reason: ctx.options.filter
            ? 'Run filtered tests with the project-local PHPUnit runner.'
            : 'Run the project-local PHPUnit test runner.',
          executesProjectCode: true,
        },
      ),
    'package-install': async (ctx) =>
      processPlan(
        ctx,
        'package-install',
        'composer',
        ['install', '--no-interaction', ...composerNoScripts(ctx)],
        {
          parser: 'composer',
          reason: `Restore Composer dependencies with ${scriptsNote(ctx)}.`,
          mutating: true,
          network: true,
          executesProjectCode: scriptsAllowed(ctx),
        },
      ),
    'package-add': async (ctx) => {
      const names = packageNames(ctx);
      return names.length === 0
        ? unavailable(ctx, 'package-add', 'At least one Composer package is required.')
        : processPlan(
            ctx,
            'package-add',
            'composer',
            [
              'require',
              '--no-interaction',
              ...composerNoScripts(ctx),
              ...(ctx.options.packageScope === 'development' ? ['--dev'] : []),
              ...names,
            ],
            {
              parser: 'composer',
              reason: `Add validated Composer packages with ${scriptsNote(ctx)}.`,
              mutating: true,
              network: true,
              executesProjectCode: scriptsAllowed(ctx),
            },
          );
    },
    'package-remove': async (ctx) => {
      const names = packageNames(ctx);
      return names.length === 0
        ? unavailable(ctx, 'package-remove', 'At least one Composer package is required.')
        : processPlan(
            ctx,
            'package-remove',
            'composer',
            ['remove', '--no-interaction', ...composerNoScripts(ctx), ...names],
            {
              parser: 'composer',
              reason: `Remove validated Composer packages with ${scriptsNote(ctx)}.`,
              mutating: true,
              executesProjectCode: scriptsAllowed(ctx),
            },
          );
    },
    'package-update': async (ctx) =>
      processPlan(
        ctx,
        'package-update',
        'composer',
        ['update', '--no-interaction', ...composerNoScripts(ctx), ...packageNames(ctx)],
        {
          parser: 'composer',
          reason: `Update Composer dependencies with ${scriptsNote(ctx)}.`,
          mutating: true,
          network: true,
          executesProjectCode: scriptsAllowed(ctx),
        },
      ),
    'package-audit': async (ctx) =>
      // `--locked`: audit composer.lock. Plain `composer audit` reads vendor/
      // and, with only a lock file, skips the audit and exits 0 — clean.
      processPlan(ctx, 'package-audit', 'composer', ['audit', '--locked', '--format=json'], {
        parser: 'composer-audit',
        reason: 'Audit Composer dependencies.',
        network: true,
      }),
    'package-outdated': async (ctx) =>
      // `--locked` for the same reason as audit: plain `outdated` reads vendor/
      // and answers `[]` for a project that is locked but not installed.
      processPlan(ctx, 'package-outdated', 'composer', ['outdated', '--locked', '--format=json'], {
        parser: 'composer-outdated',
        reason: 'Check outdated Composer dependencies.',
        network: true,
      }),
  }),
};

const csharpProfile: LanguageProfile = {
  id: 'csharp',
  displayName: 'C# / .NET',
  extensions: Object.freeze(['.cs']),
  lspLanguageIds: Object.freeze(['csharp']),
  detectors: Object.freeze([
    { kind: 'config', filename: 'global.json', weight: 25 },
    { kind: 'manifest', suffix: '.slnx', weight: 95 },
    { kind: 'manifest', suffix: '.sln', weight: 95 },
    { kind: 'manifest', suffix: '.csproj', weight: 90 },
    { kind: 'manifest', suffix: '.fsproj', weight: 90 },
    { kind: 'lockfile', filename: 'packages.lock.json', weight: 30 },
  ]),
  ignoredDirectories: COMMON_IGNORES,
  packageManagers: Object.freeze(['dotnet']),
  executables: Object.freeze(['dotnet']),
  operations: Object.freeze({
    syntax: async (ctx) =>
      processPlan(ctx, 'syntax', 'dotnet', ['build', '--no-restore'], {
        parser: 'dotnet-build',
        reason: 'Use the nearest project or solution to collect C# syntax diagnostics.',
        mutating: true,
        executesProjectCode: true,
      }),
    semantic: async (ctx) =>
      processPlan(ctx, 'semantic', 'dotnet', ['build', '--no-restore'], {
        parser: 'dotnet-build',
        reason: 'Build without restoring to collect .NET compiler diagnostics.',
        mutating: true,
        executesProjectCode: true,
      }),
    lint: async (ctx) =>
      processPlan(ctx, 'lint', 'dotnet', ['format', '--verify-no-changes', '--no-restore'], {
        parser: 'dotnet-format',
        reason: 'Verify .NET formatting and analyzers without writing source files.',
        mutating: true,
        executesProjectCode: true,
      }),
    'format-check': async (ctx) =>
      processPlan(
        ctx,
        'format-check',
        'dotnet',
        ['format', '--verify-no-changes', '--no-restore'],
        {
          parser: 'dotnet-format',
          reason: 'Verify .NET formatting without source writes.',
          mutating: true,
          executesProjectCode: true,
        },
      ),
    'format-write': async (ctx) =>
      processPlan(ctx, 'format-write', 'dotnet', ['format', '--no-restore'], {
        parser: 'dotnet-format',
        reason: 'Format .NET source files without restoring packages.',
        mutating: true,
        executesProjectCode: true,
      }),
    test: async (ctx) =>
      processPlan(
        ctx,
        'test',
        'dotnet',
        ['test', '--no-restore', ...(ctx.options.filter ? ['--filter', ctx.options.filter] : [])],
        {
          parser: 'dotnet-test',
          reason: ctx.options.filter
            ? 'Run filtered .NET tests without restoring packages.'
            : 'Run .NET tests without restoring packages.',
          mutating: true,
          executesProjectCode: true,
        },
      ),
    build: async (ctx) =>
      processPlan(ctx, 'build', 'dotnet', ['build', '--no-restore'], {
        parser: 'dotnet-build',
        reason: 'Build the nearest .NET project or solution without restoring packages.',
        mutating: true,
        executesProjectCode: true,
      }),
    run: async (ctx) =>
      processPlan(ctx, 'run', 'dotnet', ['run', '--no-restore'], {
        parser: 'command-text',
        reason: 'Run the .NET project entry point.',
        mutating: true,
        executesProjectCode: true,
      }),
    'package-install': async (ctx) =>
      processPlan(ctx, 'package-install', 'dotnet', ['restore', '--locked-mode'], {
        parser: 'dotnet-restore',
        reason: 'Restore locked .NET dependencies.',
        mutating: true,
        network: true,
        executesProjectCode: true,
      }),
    'package-add': async (ctx) => {
      const names = packageNames(ctx);
      const [spec] = names;
      const versionAt = spec?.lastIndexOf('@') ?? -1;
      const packageName = versionAt > 0 ? spec?.slice(0, versionAt) : spec;
      const packageVersion = versionAt > 0 ? spec?.slice(versionAt + 1) : undefined;
      return names.length === 0
        ? unavailable(ctx, 'package-add', 'At least one NuGet package is required.')
        : names.length > 1
          ? unavailable(ctx, 'package-add', 'NuGet package changes run one package at a time.')
          : processPlan(
              ctx,
              'package-add',
              'dotnet',
              [
                'add',
                'package',
                packageName ?? '',
                ...(packageVersion ? ['--version', packageVersion] : []),
              ],
              {
                parser: 'dotnet-package',
                reason: 'Add validated NuGet packages.',
                mutating: true,
                network: true,
                executesProjectCode: true,
              },
            );
    },
    'package-remove': async (ctx) => {
      const names = packageNames(ctx);
      return names.length === 0
        ? unavailable(ctx, 'package-remove', 'At least one NuGet package is required.')
        : processPlan(ctx, 'package-remove', 'dotnet', ['remove', 'package', ...names], {
            parser: 'dotnet-package',
            reason: 'Remove validated NuGet packages.',
            mutating: true,
          });
    },
    'package-audit': async (ctx) =>
      processPlan(
        ctx,
        'package-audit',
        'dotnet',
        ['list', 'package', '--vulnerable', '--format', 'json'],
        { parser: 'dotnet-package', reason: 'List vulnerable NuGet dependencies.', network: true },
      ),
    'package-outdated': async (ctx) =>
      processPlan(
        ctx,
        'package-outdated',
        'dotnet',
        ['list', 'package', '--outdated', '--format', 'json'],
        { parser: 'dotnet-package', reason: 'List outdated NuGet dependencies.', network: true },
      ),
  }),
};

export const PRIMARY_LANGUAGE_PROFILES: readonly LanguageProfile[] = Object.freeze([
  Object.freeze(typescriptProfile()),
  Object.freeze(javascriptProfile()),
  Object.freeze(goProfile),
  Object.freeze(rustProfile),
  Object.freeze(phpProfile),
  Object.freeze(csharpProfile),
]);

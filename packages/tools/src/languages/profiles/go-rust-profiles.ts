import { packageNames, processPlan, unavailable } from '../profile-helpers.js';
import type { LanguageProfile } from '../types.js';
import { COMMON_IGNORES, orAll } from './primary-profile-helpers.js';

export const goProfile: LanguageProfile = {
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

export const rustProfile: LanguageProfile = {
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

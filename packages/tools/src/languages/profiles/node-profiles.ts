import { internalPlan, packageNames, processPlan, unavailable } from '../profile-helpers.js';
import type { LanguageProfile, ProfileContext } from '../types.js';
import {
  COMMON_IGNORES,
  isYarnBerry,
  nodeExec,
  noScriptsArgs,
  scriptPlan,
  scriptsAllowed,
  scriptsNote,
} from './primary-profile-helpers.js';

export function typescriptProfile(): LanguageProfile {
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

export function javascriptProfile(): LanguageProfile {
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

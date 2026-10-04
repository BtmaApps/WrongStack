import { packageNames, processPlan, unavailable } from '../profile-helpers.js';
import type { LanguageProfile } from '../types.js';
import {
  COMMON_IGNORES,
  composerNoScripts,
  scriptsAllowed,
  scriptsNote,
} from './primary-profile-helpers.js';

export const phpProfile: LanguageProfile = {
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

export const csharpProfile: LanguageProfile = {
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

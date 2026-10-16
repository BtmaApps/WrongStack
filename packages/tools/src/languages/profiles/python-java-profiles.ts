import { packageNames, processPlan, unavailable } from '../profile-helpers.js';
import type { LanguageProfile, ProfileContext } from '../types.js';

export const IGNORES = Object.freeze([
  '.git',
  '.wrongstack',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
]);

export function pythonProfile(): LanguageProfile {
  return {
    id: 'python',
    displayName: 'Python',
    extensions: Object.freeze(['.py', '.pyi']),
    lspLanguageIds: Object.freeze(['python']),
    detectors: Object.freeze([
      { kind: 'config', filename: 'pyproject.toml', weight: 90 },
      { kind: 'config', filename: 'setup.py', weight: 70 },
      { kind: 'config', filename: 'setup.cfg', weight: 60 },
      { kind: 'manifest', filename: 'requirements.txt', weight: 55 },
      { kind: 'manifest', filename: 'Pipfile', weight: 50 },
      { kind: 'lockfile', filename: 'poetry.lock', weight: 30 },
      { kind: 'lockfile', filename: 'Pipfile.lock', weight: 30 },
      { kind: 'lockfile', filename: 'uv.lock', weight: 30 },
    ]),
    ignoredDirectories: IGNORES,
    packageManagers: Object.freeze(['pip', 'poetry', 'pipenv', 'uv']),
    executables: Object.freeze([
      'python',
      'python3',
      'pip',
      'pip3',
      'pip-audit',
      'poetry',
      'pipenv',
      'uv',
      'ruff',
      'black',
      'pytest',
      'mypy',
      'pyright',
    ]),
    operations: Object.freeze({
      syntax: async (ctx) => {
        const py = ctx.options.target ? 'python3' : 'python3';
        return ctx.options.target
          ? processPlan(ctx, 'syntax', py, ['-m', 'py_compile', ctx.options.target], {
              parser: 'python',
              reason: 'Compile the target file to check for syntax errors.',
            })
          : unavailable(ctx, 'syntax', 'Python syntax check requires an explicit target file.');
      },
      // mypy prints `a.py:4: error: …` without a column unless asked, and the
      // diagnostics parser reads `file:line:col:` — so every error was lost.
      semantic: async (ctx) =>
        processPlan(ctx, 'semantic', 'mypy', ['.', '--no-error-summary', '--show-column-numbers'], {
          parser: 'mypy',
          reason: 'Run mypy type checking on the workspace.',
          executesProjectCode: true,
        }),
      // Ruff's default "full" output (0.12+) puts the location on a separate
      // ` --> a.py:1:8` line; `concise` is one `a.py:1:8: F401 …` per finding.
      lint: async (ctx) =>
        processPlan(ctx, 'lint', 'ruff', ['check', '--output-format=concise', '.'], {
          parser: 'ruff',
          reason: 'Run the Ruff linter on the workspace.',
        }),
      'format-check': async (ctx) =>
        processPlan(ctx, 'format-check', 'ruff', ['format', '--check', '.'], {
          parser: 'ruff',
          reason: 'Check Python formatting without writing files.',
        }),
      'format-write': async (ctx) =>
        processPlan(ctx, 'format-write', 'ruff', ['format', '.'], {
          parser: 'ruff',
          reason: 'Format Python source files.',
          mutating: true,
        }),
      test: async (ctx) =>
        processPlan(
          ctx,
          'test',
          'pytest',
          [...(ctx.options.filter ? ['-k', ctx.options.filter] : []), '.'],
          {
            parser: 'pytest',
            reason: ctx.options.filter ? 'Run filtered Python tests.' : 'Run all Python tests.',
            mutating: true,
            executesProjectCode: true,
          },
        ),
      build: async (ctx) =>
        unavailable(ctx, 'build', 'Python is interpreted; use semantic or test instead.'),
      'debug-compile': async (ctx) =>
        processPlan(
          ctx,
          'debug-compile',
          'mypy',
          ['.', '--no-error-summary', '--show-column-numbers'],
          {
            parser: 'mypy',
            reason: 'Collect mypy type diagnostics.',
            executesProjectCode: true,
          },
        ),
      // A bare `pip install` refuses ("You must give at least one requirement
      // to install"); name the requirements file, or the project itself.
      'package-install': async (ctx) =>
        processPlan(
          ctx,
          'package-install',
          'pip',
          [
            'install',
            '--no-cache-dir',
            ...((await ctx.pathExists('requirements.txt')) ? ['-r', 'requirements.txt'] : ['.']),
          ],
          {
            parser: 'package-text',
            reason: 'Install dependencies from requirements.',
            mutating: true,
            network: true,
          },
        ),
      'package-add': async (ctx) => {
        const names = packageNames(ctx);
        return names.length === 0
          ? unavailable(ctx, 'package-add', 'At least one package name is required.')
          : processPlan(ctx, 'package-add', 'pip', ['install', ...names], {
              parser: 'package-text',
              reason: 'Install specified Python packages.',
              mutating: true,
              network: true,
            });
      },
      'package-remove': async (ctx) => {
        const names = packageNames(ctx);
        return names.length === 0
          ? unavailable(ctx, 'package-remove', 'At least one package name is required.')
          : processPlan(ctx, 'package-remove', 'pip', ['uninstall', '--yes', ...names], {
              parser: 'package-text',
              reason: 'Remove validated Python packages.',
              mutating: true,
            });
      },
      // pip has no `audit` command ("unknown command"), so this never ran. The
      // auditor is the separate `pip-audit`; bare, it audits whatever Python
      // environment is active, so point it at the project's requirements (or
      // the project itself).
      'package-audit': async (ctx) =>
        processPlan(
          ctx,
          'package-audit',
          'pip-audit',
          [
            ...((await ctx.pathExists('requirements.txt')) ? ['-r', 'requirements.txt'] : ['.']),
            '--format',
            'json',
          ],
          {
            parser: 'pip-audit',
            reason: 'Audit Python dependencies for vulnerabilities.',
            network: true,
          },
        ),
      run: async (ctx) => {
        // Try common Python entry points in priority order.
        const entries = ['main.py', 'app.py', '__main__.py', 'manage.py'];
        const first: string | undefined = (
          await Promise.all(
            entries.map((name) => ctx.pathExists(name).then((ok) => (ok ? name : undefined))),
          )
        ).find(Boolean);
        const args = first ? [first] : [];
        return processPlan(ctx, 'run', 'python3', args, {
          parser: 'command-text',
          reason: first
            ? `Run the Python entry point ${first}.`
            : 'Run the Python project (no common entry point detected — add the module path manually).',
          executesProjectCode: true,
          mutating: true,
        });
      },
    }),
  };
}

function hasGradleEvidence(ctx: ProfileContext): boolean {
  return ctx.workspace.evidence.some(
    (e) =>
      (e.kind === 'manifest' &&
        (e.value === 'build.gradle' ||
          e.value === 'build.gradle.kts' ||
          e.value === 'settings.gradle')) ||
      (e.kind === 'lockfile' && e.value === 'gradle.lockfile'),
  );
}

async function gradleRunner(ctx: ProfileContext): Promise<string> {
  // Check for the Gradle wrapper at the workspace root. The wrapper is the
  // conventional way to run Gradle — it pins the Gradle version and downloads
  // it automatically if missing.
  if (await ctx.pathExists('gradlew')) return 'gradlew';
  return 'gradle';
}

export function javaProfile(): LanguageProfile {
  return {
    id: 'java',
    displayName: 'Java / Kotlin',
    extensions: Object.freeze(['.java', '.kt', '.kts', '.scala']),
    lspLanguageIds: Object.freeze(['java', 'kotlin']),
    detectors: Object.freeze([
      { kind: 'manifest', filename: 'pom.xml', weight: 90 },
      { kind: 'manifest', filename: 'build.gradle', weight: 85 },
      { kind: 'manifest', filename: 'build.gradle.kts', weight: 85 },
      { kind: 'manifest', filename: 'settings.gradle', weight: 50 },
      { kind: 'lockfile', filename: 'gradle.lockfile', weight: 30 },
    ]),
    ignoredDirectories: IGNORES,
    packageManagers: Object.freeze(['maven', 'gradle']),
    executables: Object.freeze(['mvn', 'gradle', 'gradlew', 'java', 'kotlinc']),
    operations: Object.freeze({
      semantic: async (ctx) => {
        const isGradle = hasGradleEvidence(ctx);
        const runner = isGradle ? await gradleRunner(ctx) : 'mvn';
        const args = isGradle ? ['compileJava'] : ['compile', '-q'];
        const reason = isGradle ? 'Compile the Gradle project.' : 'Compile the Maven project.';
        return processPlan(ctx, 'semantic', runner, args, {
          parser: isGradle ? 'gradle' : 'maven',
          reason,
          mutating: true,
          executesProjectCode: true,
        });
      },
      lint: async (ctx) =>
        unavailable(
          ctx,
          'lint',
          'Java linting requires a configured checkstyle or spotbugs plugin.',
        ),
      'format-check': async (ctx) =>
        unavailable(
          ctx,
          'format-check',
          'Java formatting check requires a configured spotless or google-java-format plugin.',
        ),
      test: async (ctx) => {
        const isGradle = hasGradleEvidence(ctx);
        const runner = isGradle ? await gradleRunner(ctx) : 'mvn';
        const args = isGradle ? ['test'] : ['test', '-q'];
        const reason = isGradle ? 'Run Gradle tests.' : 'Run Maven tests.';
        return processPlan(ctx, 'test', runner, args, {
          parser: isGradle ? 'gradle' : 'maven',
          reason,
          mutating: true,
          executesProjectCode: true,
        });
      },
      build: async (ctx) => {
        const isGradle = hasGradleEvidence(ctx);
        const runner = isGradle ? await gradleRunner(ctx) : 'mvn';
        const args = isGradle ? ['build'] : ['package', '-q', '-DskipTests'];
        const reason = isGradle
          ? 'Build the Gradle project.'
          : 'Build the Maven project, skipping tests.';
        return processPlan(ctx, 'build', runner, args, {
          parser: isGradle ? 'gradle' : 'maven',
          reason,
          mutating: true,
          executesProjectCode: true,
        });
      },
      run: async (ctx) => {
        if (!hasGradleEvidence(ctx))
          return unavailable(
            ctx,
            'run',
            'Maven run requires exec-maven-plugin configuration. Use `mvn exec:java -q` manually.',
          );
        const runner = await gradleRunner(ctx);
        return processPlan(ctx, 'run', runner, ['run'], {
          parser: 'command-text',
          reason: `Run the Gradle project entry point via ${runner}.`,
          executesProjectCode: true,
          mutating: true,
        });
      },
      'package-install': async (ctx) =>
        unavailable(
          ctx,
          'package-install',
          'JVM dependency installation happens through build or dependency:get.',
        ),
      'package-add': async (ctx) => {
        const names = packageNames(ctx);
        return names.length === 0
          ? unavailable(ctx, 'package-add', 'At least one dependency coordinate is required.')
          : processPlan(ctx, 'package-add', 'mvn', ['dependency:get', `-Dartifact=${names[0]}`], {
              parser: 'maven',
              reason: 'Resolve and fetch a Maven dependency.',
              mutating: true,
              network: true,
            });
      },
    }),
  };
}

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

/**
 * The bench's own environment as its children should see it. `wstack bench`
 * runs inside the CLI, which defaults `NODE_ENV=production` for React/Ink and
 * marks that with `WRONGSTACK_NODE_ENV_DEFAULTED`. Leaked into a grader's
 * `npm install` it skipped devDependencies — jest among them — and every
 * polyglot JavaScript exercise failed with "'jest' is not recognized". Same
 * rule as core's `buildChildEnv`, without its secret stripping: the agent run
 * needs the provider keys. An operator's own exported NODE_ENV is kept.
 */
export function inheritedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (env['WRONGSTACK_NODE_ENV_DEFAULTED'] === '1') {
    delete env['NODE_ENV'];
    delete env['WRONGSTACK_NODE_ENV_DEFAULTED'];
  }
  // A Gradle daemon started by `gradlew` keeps the launching shell's stdout
  // open, so the agent's shell tool never saw the command end: a polyglot Java
  // run spent its whole 600 s budget inside one `gradlew test` call.
  const gradleOpts = env['GRADLE_OPTS'] ?? '';
  if (!gradleOpts.includes('org.gradle.daemon')) {
    env['GRADLE_OPTS'] = `${gradleOpts} -Dorg.gradle.daemon=false`.trim();
  }
  // A terminal opened before JAVA_HOME was set never sees it, so `gradlew`
  // fell back to the first `java` on PATH — Oracle's JRE 8 shim — and every
  // polyglot Java grade died with "Could not find tools.jar" while the agent's
  // own runs passed. Windows keeps the current value in the registry.
  if (!env['JAVA_HOME']) {
    const fromRegistry = registryJavaHome();
    if (fromRegistry) env['JAVA_HOME'] = fromRegistry;
  }
  return env;
}

let cachedRegistryJavaHome: string | null | undefined;

/** JAVA_HOME as Windows stores it now (user, then machine); null when absent. */
export function registryJavaHome(
  query: (key: string) => string | undefined = queryRegistryValue,
): string | null {
  if (process.platform !== 'win32') return null;
  if (query === queryRegistryValue && cachedRegistryJavaHome !== undefined) {
    return cachedRegistryJavaHome;
  }
  let found: string | null = null;
  for (const key of [
    'HKCU\\Environment',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
  ]) {
    const raw = query(key)?.trim();
    if (!raw) continue;
    // REG_EXPAND_SZ values may reference other variables (%ProgramFiles%).
    found = raw.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole);
    break;
  }
  if (query === queryRegistryValue) cachedRegistryJavaHome = found;
  return found;
}

function queryRegistryValue(key: string): string | undefined {
  try {
    const out = execFileSync('reg', ['query', key, '/v', 'JAVA_HOME'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    });
    return /JAVA_HOME\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(out)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Why `gradlew` cannot compile Java with this environment, or undefined when it
 * can. Gradle runs on JAVA_HOME's JVM, else the first `java` on PATH; either
 * must be a JDK (javac beside java). Checked before a run so a JRE costs one
 * error up front instead of a column of FAIL rows hours later.
 */
export function javaToolchainProblem(env: NodeJS.ProcessEnv = inheritedEnv()): string | undefined {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const javaHome = env['JAVA_HOME'];
  if (javaHome) {
    if (existsSync(path.join(javaHome, 'bin', `javac${exe}`))) return undefined;
    return `JAVA_HOME=${javaHome} is not a JDK (no bin${path.sep}javac${exe}); Java grading would fail.`;
  }
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  for (const dir of (env[pathKey] ?? '').split(path.delimiter)) {
    if (!dir || !existsSync(path.join(dir, `java${exe}`))) continue;
    if (existsSync(path.join(dir, `javac${exe}`))) return undefined;
    return `the first java on PATH (${dir}) is a JRE without javac and JAVA_HOME is unset; set JAVA_HOME to a JDK.`;
  }
  return 'no Java found (JAVA_HOME unset and no java on PATH); install a JDK and set JAVA_HOME.';
}

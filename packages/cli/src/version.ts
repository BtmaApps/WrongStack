import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

/**
 * Versions stamped by the standalone-binary entry (scripts/binary/entry.mjs):
 * a compiled executable has no package.json beside it to read.
 */
interface StandaloneBuildInfo {
  readonly version?: string | undefined;
  readonly apiVersion?: string | undefined;
  /** `bun build --target` the executable was compiled for, e.g. `bun-linux-x64-musl`. */
  readonly target?: string | undefined;
}
const standaloneBuild = (globalThis as Record<symbol, StandaloneBuildInfo | undefined>)[
  Symbol.for('wrongstack.standalone-build')
];

function readOwnVersion(): string {
  if (standaloneBuild?.version) return standaloneBuild.version;
  const candidates = ['../package.json', '../../package.json'];
  for (const rel of candidates) {
    try {
      const pkg = req(rel) as { version?: unknown | undefined };
      if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version;
    } catch {
      // try next
    }
  }
  return 'dev';
}

export const CLI_VERSION = readOwnVersion();

function readApiVersion(): string {
  if (standaloneBuild?.apiVersion) return standaloneBuild.apiVersion;
  try {
    const corePkg = req('@wrongstack/core/package.json') as {
      wrongstackApiVersion?: string | undefined;
    };
    if (corePkg.wrongstackApiVersion) return corePkg.wrongstackApiVersion;
  } catch {
    /* fallback */
  }
  return '0.0.0';
}

export const API_VERSION = readApiVersion();

/** Build target of the standalone executable; undefined in an npm install. */
export const STANDALONE_TARGET: string | undefined = standaloneBuild?.target;

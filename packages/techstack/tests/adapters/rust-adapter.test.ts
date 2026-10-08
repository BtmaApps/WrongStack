import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RustAdapter } from '../../src/adapters/rust.js';
import { workspaceId } from '../../src/discovery/index.js';
import { parsePurlEcosystem } from '../../src/registry/purl.js';
import type { Workspace } from '../../src/types.js';

const CARGO = `[package]\nname="x"\nversion="0.1.0"\n[dependencies]\nserde="1.0"\ntokio={version="1.40"}\n[dev-dependencies]\ncriterion="0.5"\n`;
const LOCK = `[[package]]\nname="serde"\nversion="1.0.215"\n[[package]]\nname="tokio"\nversion="1.40.0"\n`;

function mkWorkspace(files: Record<string, string>): { dir: string; ws: Workspace } {
  const dir = join(tmpdir(), `ts-rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
  return {
    dir,
    ws: {
      id: workspaceId('', 'rust'),
      relativeRoot: dir,
      ecosystem: 'rust' as const,
      manifests: Object.keys(files).filter((f) => f !== 'Cargo.lock'),
      lockfiles: Object.keys(files).filter((f) => f === 'Cargo.lock'),
      confidence: 0.9,
      coverage: 'full' as const,
    },
  };
}

describe('RustAdapter', () => {
  it('extracts deps from Cargo.toml', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.map((d) => d.name)).toContain('serde');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('separates dev-deps scope', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.find((d) => d.name === 'criterion')?.scope).toBe('development');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads locked versions from Cargo.lock', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO, 'Cargo.lock': LOCK });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.find((d) => d.name === 'serde')?.locked).toBe('1.0.215');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // TOML permits newlines inside an array value, so a valid inline table can
  // span physical lines; parsing line-by-line used to drop the whole entry.
  const CARGO_WRAPPED = [
    '[package]',
    'name = "x"',
    'version = "0.1.0"',
    '',
    '[dependencies]',
    'serde = "1.0"',
    'tokio = { version = "1.40", features = [',
    '    "rt-multi-thread",',
    '    "macros",',
    '] }',
    '',
    '[dev-dependencies]',
    'criterion = { version = "0.5", features = [',
    '    "html_reports",',
    '] }',
    '',
  ].join('\n');
  const LOCK_WRAPPED = [
    '[[package]]',
    'name = "serde"',
    'version = "1.0.215"',
    '',
    '[[package]]',
    'name = "tokio"',
    'version = "1.40.0"',
    '',
    '[[package]]',
    'name = "criterion"',
    'version = "0.5.1"',
    '',
  ].join('\n');

  it('inventories inline tables whose array value wraps onto later lines', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO_WRAPPED, 'Cargo.lock': LOCK_WRAPPED });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.map((d) => d.name).sort()).toEqual(['criterion', 'serde', 'tokio']);
      expect(deps.find((d) => d.name === 'tokio')).toMatchObject({
        requested: '1.40',
        locked: '1.40.0',
        scope: 'runtime',
        purl: 'pkg:cargo/tokio@1.40.0',
      });
      // The wrapped dev-dependency is inventoried in its own scope too.
      expect(deps.find((d) => d.name === 'criterion')).toMatchObject({
        requested: '0.5',
        locked: '0.5.1',
        scope: 'development',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Joined into one logical line, a `# comment` on a wrapped line commented out
  // the rest of the entry, the table never closed and the crate vanished.
  it('keeps a wrapped inline table whose lines carry comments', async () => {
    const cargo = CARGO_WRAPPED.replace('"rt-multi-thread",', '"rt-multi-thread", # runtime');
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': cargo, 'Cargo.lock': LOCK_WRAPPED });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.map((d) => d.name).sort()).toEqual(['criterion', 'serde', 'tokio']);
      expect(deps.find((d) => d.name === 'tokio')?.requested).toBe('1.40');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Cargo.lock legitimately lists several instances of one crate; the last
  // entry is the highest version, which the manifest requirement may not be
  // able to select (`syn = "1.0"` is a caret requirement).
  const CARGO_MULTI = [
    '[package]',
    'name = "x"',
    'version = "0.1.0"',
    '',
    '[dependencies]',
    'syn = "1.0"',
    'serde = "1.0"',
    'base64 = "=0.22.1"',
    '',
  ].join('\n');
  const LOCK_MULTI = [
    'version = 4',
    '',
    '[[package]]',
    'name = "base64"',
    'version = "0.22.1"',
    '',
    '[[package]]',
    'name = "serde"',
    'version = "1.0.215"',
    '',
    '[[package]]',
    'name = "syn"',
    'version = "1.0.109"',
    '',
    '[[package]]',
    'name = "syn"',
    'version = "2.0.48"',
    '',
  ].join('\n');

  it('selects the lock entry the manifest requirement resolves to', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO_MULTI, 'Cargo.lock': LOCK_MULTI });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.find((d) => d.name === 'syn')).toMatchObject({
        requested: '1.0',
        locked: '1.0.109',
        purl: 'pkg:cargo/syn@1.0.109',
      });
      // Single-version and exact-requirement crates are unchanged.
      expect(deps.find((d) => d.name === 'serde')?.locked).toBe('1.0.215');
      expect(deps.find((d) => d.name === 'base64')?.locked).toBe('0.22.1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits purls with the canonical cargo type that parsePurlEcosystem resolves', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO, 'Cargo.lock': LOCK });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      const serde = deps.find((d) => d.name === 'serde');
      expect(serde!.purl).toMatch(/^pkg:cargo\//);
      // Regression (round r20): the adapter used to emit `pkg:rust/…` — a
      // purl type this package's own identity resolver cannot resolve, so
      // SBOM identities and OSV advisory queries silently failed.
      const parsed = parsePurlEcosystem(serde!.purl!);
      expect(parsed).toEqual({ ecosystem: 'rust', name: 'serde', version: '1.0.215' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has manifest evidence on every dep', async () => {
    const { dir, ws } = mkWorkspace({ 'Cargo.toml': CARGO });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      for (const d of deps) expect(d.evidence.some((e) => e.kind === 'manifest')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns [] for no manifest', async () => {
    const { dir, ws } = mkWorkspace({});
    try {
      expect(await new RustAdapter().inventory(ws, {})).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('identifies a renamed dependency by its `package` crate, not its alias', async () => {
    const { dir, ws } = mkWorkspace({
      'Cargo.toml': `[package]\nname="x"\nversion="0.1.0"\n[dependencies]\nsj = { package = "serde_json", version = "1" }\n`,
      'Cargo.lock': `[[package]]\nname="serde_json"\nversion="1.0.120"\n`,
    });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.map((d) => [d.name, d.purl])).toEqual([
        ['serde_json', 'pkg:cargo/serde_json@1.0.120'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads table-form dependencies and ignores array-table keys', async () => {
    const { dir, ws } = mkWorkspace({
      'Cargo.toml': `[package]\nname="x"\nversion="0.1.0"\n[dependencies] # runtime\nserde = "1.0"\n[[bin]]\nname = "tool"\npath = "src/bin/tool.rs"\n[dependencies.tokio]\nversion = "1.40"\nfeatures = [\n  "rt",\n]\n`,
      'Cargo.lock': LOCK,
    });
    try {
      const deps = await new RustAdapter().inventory(ws, {});
      expect(deps.map((d) => d.purl)).toEqual([
        'pkg:cargo/serde@1.0.215',
        'pkg:cargo/tokio@1.40.0',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not let a trailing [[patch.unused]] table overwrite the last package', async () => {
    // Real cargo writes unused [patch] entries after the packages; their
    // name/version used to replace the last package's.
    const { dir, ws } = mkWorkspace({
      'Cargo.toml': CARGO,
      'Cargo.lock': `${LOCK}\n[[patch.unused]]\nname = "unusedpatch"\nversion = "9.9.9"\n`,
    });
    try {
      const deps = await new RustAdapter().inventory(ws, {
        projectRoot: dir,
        includeTransitive: true,
      });
      expect(deps.find((d) => d.name === 'tokio')?.locked).toBe('1.40.0');
      expect(deps.some((d) => d.name === 'unusedpatch')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('classifies transitive lock entries by source, not as crates.io by default', async () => {
    // Sourceless entries are local crates (this crate, workspace members);
    // a crates.io purl named an unrelated published crate (`config@0.1.0`).
    const { dir, ws } = mkWorkspace({
      'Cargo.toml': CARGO,
      'Cargo.lock': [
        '[[package]]\nname = "config"\nversion = "0.1.0"',
        '[[package]]\nname = "forked"\nversion = "0.5.0"\nsource = "git+https://github.com/me/forked#0123abc"',
        '[[package]]\nname = "itoa"\nversion = "1.0.11"\nsource = "registry+https://github.com/rust-lang/crates.io-index"',
      ].join('\n\n'),
    });
    try {
      const deps = await new RustAdapter().inventory(ws, {
        projectRoot: dir,
        includeTransitive: true,
      });
      expect(deps.find((d) => d.name === 'config')).toMatchObject({
        sourceType: 'path',
        status: 'local_path',
      });
      expect(deps.find((d) => d.name === 'config')?.purl).toBeUndefined();
      expect(deps.find((d) => d.name === 'forked')).toMatchObject({
        sourceType: 'git',
        status: 'git_dependency',
      });
      expect(deps.find((d) => d.name === 'forked')?.purl).toBeUndefined();
      expect(deps.find((d) => d.name === 'itoa')?.purl).toBe('pkg:cargo/itoa@1.0.11');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

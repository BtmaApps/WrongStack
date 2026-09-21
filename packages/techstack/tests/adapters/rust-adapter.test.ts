import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RustAdapter } from '../../src/adapters/rust.js';
import { workspaceId } from '../../src/discovery/index.js';
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
        purl: 'pkg:rust/tokio@1.40.0',
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
        purl: 'pkg:rust/syn@1.0.109',
      });
      // Single-version and exact-requirement crates are unchanged.
      expect(deps.find((d) => d.name === 'serde')?.locked).toBe('1.0.215');
      expect(deps.find((d) => d.name === 'base64')?.locked).toBe('0.22.1');
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
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serveAttachedSageMcpStdio = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@wrongstack/sage-mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/sage-mcp')>()),
  serveAttachedSageMcpStdio,
}));

import { findExecutableOnPath, sageCmd } from '../src/subcommands/handlers/sage.js';

function makeDeps(projectRoot: string, flags: Record<string, string | boolean> = {}) {
  const lines: string[] = [];
  const errors: string[] = [];
  const deps = {
    projectRoot,
    flags,
    config: { Sage: { storage: { directory: 'custom-sage' } } },
    renderer: {
      write: (text: string) => lines.push(text),
      writeError: (text: string) => errors.push(text),
    },
  };
  return { deps: deps as never, lines, errors };
}

describe('wstack sage', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-sage-cmd-'));
    serveAttachedSageMcpStdio.mockClear();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('--dry-run previews without touching the disk', async () => {
    const { deps, lines } = makeDeps(root);
    expect(await sageCmd(['connect', 'claude-code', '--dry-run'], deps)).toBe(0);
    expect(lines.join('')).toContain('Preview (nothing written)');
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('connect writes, disconnect removes and prunes the empty directories', async () => {
    fs.mkdirSync(path.join(root, '.cursor'));
    fs.writeFileSync(path.join(root, '.cursor', 'keep.json'), '{}');

    expect(await sageCmd(['connect', 'cursor'], makeDeps(root).deps)).toBe(0);
    expect(fs.existsSync(path.join(root, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cursor', 'rules', 'wrongstack-sage-memory.mdc'))).toBe(
      true,
    );

    expect(await sageCmd(['disconnect', 'cursor'], makeDeps(root).deps)).toBe(0);
    expect(fs.readdirSync(path.join(root, '.cursor'))).toEqual(['keep.json']);
  });

  it('reports a broken client config and exits non-zero without rewriting it', async () => {
    fs.writeFileSync(path.join(root, '.mcp.json'), '{ nope');
    const { deps, errors } = makeDeps(root);
    expect(await sageCmd(['connect', 'claude-code'], deps)).toBe(1);
    expect(errors.join('')).toContain('not valid JSON');
    expect(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe('{ nope');
  });

  it('rejects an unknown client with usage', async () => {
    const { deps, lines } = makeDeps(root);
    expect(await sageCmd(['connect', 'vscode'], deps)).toBe(1);
    expect(lines.join('')).toContain('Usage:');
  });

  it('connect print renders snippets for any MCP client', async () => {
    const { deps, lines } = makeDeps(root);
    expect(await sageCmd(['connect', 'print', '--command', process.execPath], deps)).toBe(0);
    const text = lines.join('');
    expect(text).toContain('"wrongstack-sage"');
    expect(text).toContain('[mcp_servers.wrongstack-sage]');
  });

  it('mcp serves attached, with the origin from the parsed flags and the config storage dir', async () => {
    // The dispatcher strips flags into deps.flags; the handler restores `--origin`.
    const { deps } = makeDeps(root, { origin: 'codex' });
    expect(await sageCmd(['mcp'], deps)).toBe(0);
    expect(serveAttachedSageMcpStdio).toHaveBeenCalledWith({
      projectRoot: root,
      directory: 'custom-sage',
      origin: 'codex',
    });
  });

  it('findExecutableOnPath resolves an explicit path and misses an absent command', () => {
    expect(findExecutableOnPath(process.execPath)).toBe(path.resolve(process.execPath));
    expect(findExecutableOnPath('definitely-not-a-real-command-4821')).toBeNull();
  });
});

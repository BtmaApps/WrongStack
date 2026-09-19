/**
 * Per-site regression for the wave-2 dot-dot fix in `handleShellOpen`
 * (server/shell-open.ts): the Layer-2 early-reject used a bare
 * `startsWith('..')`, which misread legal in-root first segments like
 * `..hidden/...` as traversal and refused to open them. The canonical
 * predicate (`rel === '..'` or `..`+sep prefix or absolute) keeps real
 * escapes out while letting in-root dot-dot names through to the
 * realpath/existence layers.
 *
 * Spawn-free proof: an EXISTING in-root `..hidden` file requested with an
 * unknown `target` crosses all three containment layers and lands on the
 * "Unknown shell.open target" verdict — pre-fix it never got past Layer 2
 * ("Path must be inside the project directory."). A MISSING in-root
 * `..hidden` path reaches the existence layer and surfaces ENOENT, so the
 * OS opener is never invoked in any of these cases.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleShellOpen } from '../src/server/shell-open.js';

const CONTAINMENT_MESSAGE = 'Path must be inside the project directory.';

describe('handleShellOpen: legal in-root ..-prefixed paths pass containment', () => {
  let projectDir: string;
  let outsideDir: string;
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-shellopen-in-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-shellopen-out-'));
    await fs.mkdir(path.join(projectDir, '..hidden'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '..hidden', 'exists.txt'), 'x', 'utf8');
    await fs.writeFile(path.join(outsideDir, 'outside.txt'), 'x', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  const open = (targetPath: string, target = 'file-manager') =>
    handleShellOpen(
      { path: targetPath, target } as never,
      logger as never,
      { projectRoot: projectDir } as never,
    );

  it('crosses every containment layer for an existing in-root ..-prefixed file', async () => {
    const result = await open('..hidden/exists.txt', 'bogus-target');
    expect(result).toEqual({
      success: false,
      message: 'Unknown shell.open target: bogus-target',
    });
  });

  it('reaches the existence layer (ENOENT), not containment, for a missing in-root ..-prefixed path', async () => {
    const result = await open('..hidden/missing.txt');
    expect(result.success).toBe(false);
    expect(result.message).not.toContain(CONTAINMENT_MESSAGE);
    expect(result.message).toMatch(/ENOENT|no such file/i);
  });

  it('still refuses a real ../ traversal outside the project root', async () => {
    const result = await open('../outside.txt');
    expect(result.success).toBe(false);
    expect(result.message).toBe(CONTAINMENT_MESSAGE);
  });

  it('control: an ordinary missing in-root path also reaches the existence layer', async () => {
    const result = await open('missing.txt');
    expect(result.success).toBe(false);
    expect(result.message).not.toContain(CONTAINMENT_MESSAGE);
    expect(result.message).toMatch(/ENOENT|no such file/i);
  });
});

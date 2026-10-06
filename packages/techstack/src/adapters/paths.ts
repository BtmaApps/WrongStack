/**
 * TechStack — adapter path resolution.
 *
 * `Workspace.relativeRoot` is deliberately project-relative: snapshots are
 * persisted and shipped to the browser, so they must stay portable across
 * machines. Adapters, however, have to actually open files, and a relative
 * root resolves against `process.cwd()` — which is only the project root by
 * coincidence. The server can be started from anywhere, and switching projects
 * mid-session doesn't move `cwd` at all.
 *
 * So the absolute base travels alongside the workspace, via
 * `InventoryOptions.projectRoot`, instead of being baked into the persisted
 * type.
 *
 * @see docs/archive/specs/techstack-sdd.md §3.2
 */

import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Evidence, Workspace } from '../types.js';
import type { InventoryOptions } from './interface.js';

/**
 * Absolute filesystem root of a workspace.
 *
 * Falls back to resolving against `cwd` when no `projectRoot` is supplied, to
 * keep older direct callers working.
 */
export function workspaceRoot(workspace: Workspace, options: InventoryOptions): string {
  const relative = workspace.relativeRoot || '.';
  return options.projectRoot ? resolve(options.projectRoot, relative) : resolve(relative);
}

/**
 * Resolve a manifest/lockfile path that may arrive either absolute (as
 * `Workspace.manifests` entries do, straight from discovery) or as a bare
 * filename (as adapter fallbacks use).
 *
 * Use this instead of `join`: `join('/a/b', '/a/b/package.json')` yields
 * `/a/b/a/b/package.json`, which is exactly the bug that silently emptied the
 * npm, Go, and Rust inventories — every workspace threw on read and the
 * engine's `catch { deps = [] }` swallowed it.
 */
export function resolveIn(root: string, candidate: string): string {
  return resolve(root, candidate);
}

/** Create portable manifest evidence with a single consistent timestamp shape. */
export function manifestEvidence(path: string): Evidence {
  return { kind: 'manifest', source: path, retrievedAt: new Date().toISOString() };
}

/** Create portable lockfile evidence with a single consistent timestamp shape. */
export function lockfileEvidence(path: string): Evidence {
  return { kind: 'lockfile', source: path, retrievedAt: new Date().toISOString() };
}

/** Lightweight existence check shared by adapters that probe fallback paths. */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

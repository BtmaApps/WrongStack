/**
 * Workspace member discovery.
 *
 * WrongStack no longer publishes to npm: every workspace package is
 * `"private": true` and releases ship only as GitHub Release binaries and
 * Desktop installers. The npm publish inventory and dependency layering that
 * used to live here went away with the npm publish script; what remains is the workspace member list that the build (`scripts/build.mjs`),
 * the binary deploy (`scripts/lib/deploy-bun-workspace.mjs`) and the
 * package-contract gate (`scripts/check-package-contracts.mjs`) share.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Resolve the workspace member directories from the root `workspaces` field
 * (falling back to a legacy `pnpm-workspace.yaml`), so the
 * list covers every member — not just `packages/*`.
 * The workspace globs here are simple (`packages/*`, `apps/*`, a literal
 * `website`), so a line parse avoids pulling in a YAML dependency.
 * @param {string} [root] repository root to read the workspace file from
 * @returns {string[]} absolute workspace member directory paths
 */
export function workspaceMemberDirs(root = repoRoot) {
  const rootManifest = join(root, 'package.json');
  if (existsSync(rootManifest)) {
    const workspaces = JSON.parse(readFileSync(rootManifest, 'utf8')).workspaces;
    if (Array.isArray(workspaces)) {
      return workspaces.flatMap((glob) => {
        if (glob.endsWith('/*')) {
          const base = join(root, glob.slice(0, -2));
          if (!existsSync(base)) return [];
          return readdirSync(base, { withFileTypes: true })
            .filter(
              (entry) => entry.isDirectory() && existsSync(join(base, entry.name, 'package.json')),
            )
            .map((entry) => join(base, entry.name));
        }
        return existsSync(join(root, glob, 'package.json')) ? [join(root, glob)] : [];
      });
    }
  }
  // Backwards compatibility for older fixture/release trees.
  const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  /** @type {string[]} */
  const dirs = [];
  let inPackages = false;
  for (const line of text.split('\n')) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (item) {
      const glob = item[1].replace(/^["']|["']$/g, '');
      if (glob.endsWith('/*')) {
        const base = join(root, glob.slice(0, -2));
        if (existsSync(base)) {
          for (const entry of readdirSync(base, { withFileTypes: true })) {
            if (entry.isDirectory()) dirs.push(join(base, entry.name));
          }
        }
      } else if (!glob.includes('*') && existsSync(join(root, glob))) {
        dirs.push(join(root, glob));
      }
      continue;
    }
    // First non-list line at column 0 (e.g. `overrides:`) ends the block.
    if (/^\S/.test(line)) break;
  }
  return dirs;
}

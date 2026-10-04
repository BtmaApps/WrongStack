/**
 * What kind of folder a session was launched in — a codebase, or a scratch /
 * home folder. Shared by the CLI startup menu and both WebUI hosts, which
 * suggest the general-purpose Scout identity outside a project.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type ProjectKind =
  /** `.wrongstack/AGENTS.md` exists — fully set up. */
  | 'initialized'
  /** Has a recognizable manifest (package.json, pyproject.toml, etc.) but no AGENTS.md yet. */
  | 'project'
  /** No manifest, no AGENTS.md — probably an empty/scratch directory. */
  | 'empty';

const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'Gemfile',
];

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function detectProjectKind(projectRoot: string): Promise<ProjectKind> {
  if (await exists(path.join(projectRoot, '.wrongstack', 'AGENTS.md'))) return 'initialized';
  for (const manifest of MANIFESTS) {
    if (await exists(path.join(projectRoot, manifest))) return 'project';
  }
  return 'empty';
}

/**
 * No manifest, no AGENTS.md, and no git repository at the project root: a
 * scratch or home folder rather than a codebase. The CLI checks it after the
 * project check, so a `git init` the user just accepted already counts.
 */
export async function isOutsideProject(projectRoot: string): Promise<boolean> {
  if ((await detectProjectKind(projectRoot)) !== 'empty') return false;
  return !(await exists(path.join(projectRoot, '.git')));
}

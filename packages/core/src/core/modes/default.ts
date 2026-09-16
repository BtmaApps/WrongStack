import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandSharedSystemInstructions } from '../../utils/instruction-file.js';

export const PROMPT = expandSharedSystemInstructions(readBundledInstructionFile('system.md'));

/**
 * Leader-only after-task affordances. The full text lives in
 * `packages/core/instructions/leader-after-task.md` so prompt wording can be
 * overridden without editing TypeScript.
 */
export const LEADER_AFTER_TASK_PROMPT = readBundledInstructionFile('leader-after-task.md');

function readBundledInstructionFile(name: string): string {
  for (const dir of bundledInstructionDirCandidates()) {
    const file = path.join(dir, name);
    try {
      return readFileSync(file, 'utf8').trimEnd();
    } catch {
      // try next candidate
    }
  }
  return '';
}

function bundledInstructionDirCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../instructions'),
    path.resolve(here, '../../instructions'),
    path.resolve(here, '../instructions'),
    path.resolve(here, 'instructions'),
  ];
  return candidates.sort((a, b) => Number(!isDirectory(a)) - Number(!isDirectory(b)));
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

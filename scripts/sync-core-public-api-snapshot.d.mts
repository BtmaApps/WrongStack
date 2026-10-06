/** Reads a repo-relative file's text; throws when it cannot be read. */
export type ReadSource = (file: string) => string;

export function isSnapshotInput(file: string, readSource?: ReadSource): boolean;
export function changedSnapshotInputs(files: readonly string[], readSource?: ReadSource): string[];
export function helpText(): string;
export function main(): void;

export interface SnapshotDecision {
  action: 'skip' | 'generate' | 'fail';
  stagedInputs: string[];
  unsafeInputs?: string[];
}

export function decideSnapshotAction(input: {
  staged?: string[];
  unstaged?: string[];
  untracked?: string[];
  readSource?: ReadSource;
}): SnapshotDecision;

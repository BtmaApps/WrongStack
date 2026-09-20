/**
 * Regression tests for the pre-commit Core API snapshot guard's decision
 * semantics (scripts/sync-core-public-api-snapshot.mjs).
 *
 * Locked-in contract, motivated by the 2026-09-20 shared-worktree incident:
 * a fenced commit whose staged set contains NO snapshot input must pass
 * (skip regeneration) even while unrelated peer edits to snapshot inputs sit
 * unstaged/untracked in the tree — those edits cannot reach the generated
 * artifacts because regeneration never runs. Conversely, when the staged set
 * DOES touch snapshot inputs, regeneration would read the dirty working tree,
 * so any other unstaged/untracked input must still hard-fail the sync (the
 * fail-closed safety that prevents capturing unrelated shared-worktree work
 * into the committed architecture artifacts).
 *
 * The decision is exercised through the exported pure function so no test
 * shells out to git or mutates the real index.
 */
import { describe, expect, it } from 'vitest';

const SCRIPT_URL = new URL(
  '../../../../scripts/sync-core-public-api-snapshot.mjs',
  import.meta.url,
);

interface SnapshotDecision {
  action: 'skip' | 'generate' | 'fail';
  stagedInputs: string[];
  unsafeInputs?: string[];
}

interface SnapshotScript {
  isSnapshotInput(file: string): boolean;
  changedSnapshotInputs(files: string[]): string[];
  decideSnapshotAction(input: {
    staged?: string[];
    unstaged?: string[];
    untracked?: string[];
  }): SnapshotDecision;
}

// Runtime-computed specifier keeps TypeScript from trying to resolve the
// untyped root .mjs; the shape is asserted locally.
const script = (await import(SCRIPT_URL.href)) as unknown as SnapshotScript;
const { isSnapshotInput, changedSnapshotInputs, decideSnapshotAction } = script;

describe('sync-core-public-api-snapshot input classification', () => {
  it('treats every packages/apps/scripts TS/JS source as a snapshot input', () => {
    expect(isSnapshotInput('packages/core/src/index.ts')).toBe(true);
    expect(isSnapshotInput('packages/tools/src/fetch.ts')).toBe(true);
    expect(isSnapshotInput('packages/tools/tests/fetch.test.ts')).toBe(true);
    expect(isSnapshotInput('scripts/sync-core-public-api-snapshot.mjs')).toBe(true);
    expect(isSnapshotInput('apps/desktop/src/main.ts')).toBe(true);
    expect(isSnapshotInput('packages/cli/src/foo.jsx')).toBe(true);
  });

  it('treats the policy/package manifests as inputs regardless of extension', () => {
    expect(isSnapshotInput('packages/core/package.json')).toBe(true);
    expect(isSnapshotInput('architecture/core-api-policy.json')).toBe(true);
  });

  it('does not treat non-source files as inputs', () => {
    expect(isSnapshotInput('docs/notes.md')).toBe(false);
    expect(isSnapshotInput('package-lock.json')).toBe(false);
    expect(isSnapshotInput('README.md')).toBe(false);
    expect(isSnapshotInput('packages/core/src/parser.py')).toBe(false);
    expect(isSnapshotInput('logo.svg')).toBe(false);
  });

  it('filters, deduplicates, and sorts changed inputs', () => {
    expect(
      changedSnapshotInputs([
        'packages/b/z.ts',
        'docs/skip.md',
        'packages/a/a.ts',
        'packages/b/z.ts',
      ]),
    ).toEqual(['packages/a/a.ts', 'packages/b/z.ts']);
  });
});

describe('sync-core-public-api-snapshot decision semantics', () => {
  it('skips (passes) when the staged set touches no input, despite dirty inputs elsewhere', () => {
    // The 2026-09-20 incident: fenced non-input commit blocked by peer edits.
    const decision = decideSnapshotAction({
      staged: ['docs/release-notes.md', 'logo.svg'],
      unstaged: ['packages/core/src/typesafe/settings.ts'],
      untracked: ['packages/core/src/typesafe/readiness.ts'],
    });
    expect(decision.action).toBe('skip');
    expect(decision.stagedInputs).toEqual([]);
  });

  it('skips when nothing is staged at all', () => {
    const decision = decideSnapshotAction({
      staged: [],
      unstaged: ['packages/tui/src/app.ts'],
      untracked: ['packages/tools/src/new.ts'],
    });
    expect(decision.action).toBe('skip');
  });

  it('generates when staged inputs exist and the rest of the tree is clean', () => {
    const decision = decideSnapshotAction({
      staged: ['packages/tools/src/fetch.ts'],
      unstaged: [],
      untracked: [],
    });
    expect(decision.action).toBe('generate');
    expect(decision.stagedInputs).toEqual(['packages/tools/src/fetch.ts']);
  });

  it('still fails closed when staged inputs exist alongside unstaged peer inputs', () => {
    const decision = decideSnapshotAction({
      staged: ['packages/tools/src/fetch.ts'],
      unstaged: ['packages/core/src/typesafe/client.ts'],
      untracked: ['packages/core/src/typesafe/readiness.ts'],
    });
    expect(decision.action).toBe('fail');
    expect(decision.unsafeInputs).toEqual([
      'packages/core/src/typesafe/client.ts',
      'packages/core/src/typesafe/readiness.ts',
    ]);
  });

  it('fails closed for untracked inputs alone when regeneration would run', () => {
    const decision = decideSnapshotAction({
      staged: ['scripts/build-package.mjs'],
      unstaged: [],
      untracked: ['packages/runtime/src/jev-checks.ts'],
    });
    expect(decision.action).toBe('fail');
    expect(decision.unsafeInputs).toEqual(['packages/runtime/src/jev-checks.ts']);
  });

  it('does not let non-input dirt block a staged-input commit', () => {
    const decision = decideSnapshotAction({
      staged: ['packages/core/src/index.ts'],
      unstaged: ['docs/notes.md'],
      untracked: ['assets/new-logo.svg'],
    });
    expect(decision.action).toBe('generate');
  });

  it('fails closed when the staged set mixes inputs and non-inputs with peer dirt', () => {
    const decision = decideSnapshotAction({
      staged: ['packages/tools/src/fetch.ts', 'docs/notes.md'],
      unstaged: ['packages/cli/src/main.ts'],
      untracked: [],
    });
    expect(decision.action).toBe('fail');
    expect(decision.stagedInputs).toEqual(['packages/tools/src/fetch.ts']);
    expect(decision.unsafeInputs).toEqual(['packages/cli/src/main.ts']);
  });
});

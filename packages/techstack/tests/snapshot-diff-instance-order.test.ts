import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../src/snapshot-diff.js';
import type { DependencyObservation, Snapshot } from '../src/types.js';

function dep(id: string, requested: string, locked = '1.0.0'): DependencyObservation {
  return {
    id,
    workspaceId: 'ws',
    ecosystem: 'npm',
    name: 'example',
    sourceType: 'registry',
    direct: true,
    scope: 'runtime',
    locked,
    requested,
    status: 'current',
    evidence: [],
  };
}
function snapshot(dependencies: readonly DependencyObservation[]): Snapshot {
  return {
    id: 'snap',
    projectId: 'project',
    targetRoot: '.',
    fingerprint: 'fixed',
    createdAt: '2026-10-12T00:00:00.000Z',
    adapterVersion: '1.1.0',
    coverage: 'full',
    workspaces: [],
    findings: [],
    dependencies,
  };
}
const emptyDiff = { added: [], removed: [], changed: [] };

describe('matching snapshot instances within a shared version', () => {
  it('does not invent changes when stable-ID observations are reordered', () => {
    const first = dep('first', '^1.0.0');
    const second = dep('second', '~1.0.0');
    expect(diffSnapshots(snapshot([first, second]), snapshot([second, first]))).toEqual(emptyDiff);
  });

  it('reports only the actual field change after reordering', () => {
    const first = dep('first', '^1.0.0');
    const second = dep('second', '~1.0.0');
    const result = diffSnapshots(
      snapshot([first, second]),
      snapshot([{ ...second, status: 'vulnerable' }, first]),
    );
    expect(result).toEqual({
      added: [],
      removed: [],
      changed: [
        {
          name: 'example',
          ecosystem: 'npm',
          workspaceId: 'ws',
          field: 'status',
          from: 'current',
          to: 'vulnerable',
        },
      ],
    });
  });

  it('reserves a stable-ID match when an unmatched row arrives first', () => {
    const survivor = dep('survivor', '~1.0.0');
    const replaced = dep('replaced', '^1.0.0');
    const replacement = dep('replacement', '>=1.0.0');
    const result = diffSnapshots(snapshot([survivor, replaced]), snapshot([replacement, survivor]));
    expect(result).toEqual({
      added: [],
      removed: [],
      changed: [
        {
          name: 'example',
          ecosystem: 'npm',
          workspaceId: 'ws',
          field: 'requested',
          from: '^1.0.0',
          to: '>=1.0.0',
        },
      ],
    });
  });

  it('adds the introduced row rather than a surviving same-version sibling', () => {
    const survivor = dep('survivor', '^1.0.0');
    const introduced = dep('introduced', '~1.0.0');
    expect(diffSnapshots(snapshot([survivor]), snapshot([introduced, survivor]))).toEqual({
      added: [introduced],
      removed: [],
      changed: [],
    });
  });

  it('removes the missing row rather than its surviving same-version sibling', () => {
    const removed = dep('removed', '^1.0.0');
    const survivor = dep('survivor', '~1.0.0');
    expect(diffSnapshots(snapshot([removed, survivor]), snapshot([survivor]))).toEqual({
      added: [],
      removed: [removed],
      changed: [],
    });
  });

  it('retains version-based fallback when every ID is regenerated', () => {
    expect(
      diffSnapshots(
        snapshot([dep('old-a', '^1.0.0'), dep('old-b', '~1.0.0')]),
        snapshot([dep('new-a', '^1.0.0'), dep('new-b', '~1.0.0')]),
      ),
    ).toEqual(emptyDiff);
  });

  it('still pairs distinct versions independently of array order', () => {
    const first = dep('first', '^1.0.0');
    const second = dep('second', '~2.0.0', '2.0.0');
    expect(diffSnapshots(snapshot([first, second]), snapshot([second, first]))).toEqual(emptyDiff);
  });

  it('does not mutate input arrays or observations', () => {
    const first = Object.freeze(dep('first', '^1.0.0'));
    const second = Object.freeze(dep('second', '~1.0.0'));
    const before = Object.freeze([first, second]);
    const after = Object.freeze([second, first]);
    diffSnapshots(snapshot(before), snapshot(after));
    expect(before).toEqual([first, second]);
    expect(after).toEqual([second, first]);
  });
});

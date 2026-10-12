/**
 * TechStack — Snapshot diff utility.
 *
 * Compares two snapshots to identify added, removed, and changed dependencies.
 *
 * @see docs/archive/specs/techstack-sdd.md §9
 */

import type { DependencyObservation, Snapshot } from './types.js';

export interface SnapshotDiff {
  added: DependencyObservation[];
  removed: DependencyObservation[];
  changed: Array<{
    name: string;
    ecosystem: string;
    workspaceId?: string;
    field: string;
    from: string;
    to: string;
  }>;
}

/**
 * Identity of one INSTALLED instance of a package.
 *
 * A lockfile resolves a package to as many versions as its dependents need, and
 * the adapters emit one row per instance for exactly that reason (this repo's
 * own lock holds fs-extra at 12 versions, minimatch at 8) — OSV is queried per
 * purl, so an omitted instance is an advisory blind spot. Keying the diff by
 * `(workspace, ecosystem, name)` alone collapsed those instances onto a single
 * map entry where the LAST one won: every other instance vanished from `added`
 * and `removed`, and the one `changed` entry was computed from whichever
 * instance happened to be last in each array. An instance added, removed, or
 * re-statused alongside a sibling of the same name was reported as nothing.
 */
const depKey = (dep: DependencyObservation): string =>
  JSON.stringify([dep.workspaceId || null, dep.ecosystem, dep.name]);

/** The resolved version of one instance, or `''` when it was never resolved. */
const instanceVersion = (dep: DependencyObservation): string =>
  String(dep.locked ?? dep.installed ?? dep.requested ?? '');

/** Group a snapshot's dependencies by package, preserving every instance. */
function groupByPackage(
  dependencies: readonly DependencyObservation[],
): Map<string, DependencyObservation[]> {
  const grouped = new Map<string, DependencyObservation[]>();
  for (const dep of dependencies) {
    const key = depKey(dep);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(dep);
    else grouped.set(key, [dep]);
  }
  return grouped;
}

/**
 * Compare two snapshots by dependency workspace, name, and ecosystem.
 *
 * Returns added (in new but not old), removed (in old but not new), and
 * changed (version/status differences for matching dependencies).
 */
export function diffSnapshots(oldSnapshot: Snapshot, newSnapshot: Snapshot): SnapshotDiff {
  const oldByPackage = groupByPackage(oldSnapshot.dependencies);
  const newByPackage = groupByPackage(newSnapshot.dependencies);

  const added: DependencyObservation[] = [];
  const removed: DependencyObservation[] = [];
  const changed: SnapshotDiff['changed'] = [];

  const fields: Array<keyof DependencyObservation> = [
    'locked',
    'installed',
    'requested',
    'status',
    'latestStable',
  ];

  const recordFieldChanges = (
    oldDep: DependencyObservation,
    newDep: DependencyObservation,
  ): void => {
    for (const field of fields) {
      const rawOld = oldDep[field];
      const rawNew = newDep[field];
      if (rawOld === rawNew) continue;
      changed.push({
        name: newDep.name,
        ecosystem: newDep.ecosystem,
        ...(newDep.workspaceId ? { workspaceId: newDep.workspaceId } : {}),
        field: String(field),
        from: rawOld != null ? String(rawOld) : '',
        to: rawNew != null ? String(rawNew) : '',
      });
    }
  };

  for (const [key, newDeps] of newByPackage) {
    const oldDeps = oldByPackage.get(key);
    // Package absent from the old snapshot — every instance is an addition.
    if (!oldDeps) {
      added.push(...newDeps);
      continue;
    }
    // One instance on each side is unambiguous: the package matched, so a
    // version move stays a `changed` entry (the long-standing behaviour).
    if (oldDeps.length === 1 && newDeps.length === 1) {
      recordFieldChanges(oldDeps[0]!, newDeps[0]!);
      continue;
    }
    // Multi-instance: pair by resolved version, using stable IDs to disambiguate
    // siblings sharing that version. Paired rows are diffed field-by-field;
    // unpaired rows are a genuine add or remove rather than silently dropped.
    const oldByVersion = new Map<string, DependencyObservation[]>();
    for (const dep of oldDeps) {
      const version = instanceVersion(dep);
      const bucket = oldByVersion.get(version);
      if (bucket) bucket.push(dep);
      else oldByVersion.set(version, [dep]);
    }
    // Reserve surviving IDs so an unmatched row cannot consume a later sibling's match.
    const newIdsByVersion = new Map<string, Set<string>>();
    for (const dep of newDeps) {
      const version = instanceVersion(dep);
      let ids = newIdsByVersion.get(version);
      if (!ids) {
        ids = new Set();
        newIdsByVersion.set(version, ids);
      }
      ids.add(dep.id);
    }
    for (const dep of newDeps) {
      const version = instanceVersion(dep);
      const candidates = oldByVersion.get(version);
      let previous: DependencyObservation | undefined;
      if (candidates) {
        let index = candidates.findIndex((candidate) => candidate.id === dep.id);
        if (index < 0) {
          const reservedIds = newIdsByVersion.get(version);
          index = candidates.findIndex((candidate) => !reservedIds?.has(candidate.id));
        }
        if (index >= 0) previous = candidates.splice(index, 1)[0];
      }
      if (previous) recordFieldChanges(previous, dep);
      else added.push(dep);
    }
    for (const remaining of oldByVersion.values()) {
      removed.push(...remaining);
    }
  }

  // Packages gone from the new snapshot — every instance is a removal.
  for (const [key, oldDeps] of oldByPackage) {
    if (!newByPackage.has(key)) {
      removed.push(...oldDeps);
    }
  }

  return { added, removed, changed };
}

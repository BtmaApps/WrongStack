import * as path from 'node:path';
import { isAgedOutForInjection } from '../shared/injection-recency.js';
import { isProgressLogText } from '../shared/progress-log.js';
import type { MemoryCandidate, Sage } from '../types.js';

/**
 * Deterministic half of consolidation: which memories are worth distilling and
 * how they group. No model call happens here.
 *
 * The pool is what auto-injection already drops: progress logs and
 * non-evergreen memories that aged out unused. They are not deleted, so their
 * one durable lesson (a gotcha, a do-not-re-audit list, a root cause) is
 * recoverable only by distilling it into a memory that injection will carry.
 */

const SHARED_SCOPES = new Set<Sage['scope']>(['project', 'file', 'symbol']);
const PATH_ANCHOR_TYPES = new Set(['file', 'symbol', 'test']);
const SKIPPED_KINDS = new Set<Sage['kind']>(['memory_review', 'session_digest']);
const PINNED_IMPORTANCE = 0.9;
const MIN_TOPIC_DIRECTORY_SEGMENTS = 4;
/** Text shown to the model per member; the head carries the claim. */
export const MEMBER_PROMPT_CHARS = 1_500;
/** A rejected proposal's members are not re-proposed for this long. */
export const REJECTED_COOLDOWN_MS = 90 * 86_400_000;

export interface ConsolidationBatch {
  /** The anchor path (or its directory) the members share. */
  key: string;
  members: Sage[];
}

export interface ConsolidationBatchOptions {
  minMembers?: number | undefined;
  maxMembers?: number | undefined;
  maxChars?: number | undefined;
}

function pathAnchors(memory: Sage): string[] {
  const out = new Set<string>();
  for (const anchor of memory.anchors) {
    if (anchor.path && PATH_ANCHOR_TYPES.has(anchor.type)) {
      out.add(anchor.path.replaceAll('\\', '/'));
    }
  }
  return [...out];
}

/** Members already covered by a consolidation proposal (pending, accepted, or recently rejected). */
export function proposedMemberIds(
  candidates: readonly MemoryCandidate[],
  nowMs: number,
): Set<string> {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.suggestedAction !== 'consolidate') continue;
    if (candidate.status === 'rejected') {
      const at = Date.parse(candidate.updatedAt);
      if (Number.isFinite(at) && nowMs - at >= REJECTED_COOLDOWN_MS) continue;
    }
    for (const id of candidate.supersedesMemoryIds ?? []) ids.add(id);
  }
  return ids;
}

export function selectConsolidationPool(
  memories: readonly Sage[],
  nowMs: number,
  excluded: ReadonlySet<string> = new Set(),
): Sage[] {
  return memories.filter(
    (memory) =>
      memory.status === 'active' &&
      SHARED_SCOPES.has(memory.scope) &&
      !SKIPPED_KINDS.has(memory.kind) &&
      memory.persistence !== 'permanent' &&
      memory.importance < PINNED_IMPORTANCE &&
      memory.contextPolicy !== 'never' &&
      !memory.audience &&
      !excluded.has(memory.id) &&
      pathAnchors(memory).length > 0 &&
      (isProgressLogText(memory.text) || isAgedOutForInjection(memory, nowMs)),
  );
}

/** Assign each memory to the largest group it belongs to; return groups that reached `minMembers`. */
function groupBy(
  memories: readonly Sage[],
  keysOf: (memory: Sage) => string[],
  minMembers: number,
): { groups: ConsolidationBatch[]; leftover: Sage[] } {
  const byKey = new Map<string, Sage[]>();
  for (const memory of memories) {
    for (const key of keysOf(memory)) {
      const list = byKey.get(key) ?? [];
      list.push(memory);
      byKey.set(key, list);
    }
  }
  const assigned = new Set<string>();
  const groups: ConsolidationBatch[] = [];
  const ordered = [...byKey].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [key, list] of ordered) {
    const members = list.filter((memory) => !assigned.has(memory.id));
    if (members.length < minMembers) continue;
    for (const memory of members) assigned.add(memory.id);
    groups.push({ key, members });
  }
  return { groups, leftover: memories.filter((memory) => !assigned.has(memory.id)) };
}

function chunk(
  group: ConsolidationBatch,
  opts: { minMembers: number; maxMembers: number; maxChars: number },
) {
  const members = [...group.members].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const batches: ConsolidationBatch[] = [];
  let current: Sage[] = [];
  let chars = 0;
  for (const memory of members) {
    const size = Math.min(memory.text.length, MEMBER_PROMPT_CHARS);
    if (current.length > 0 && (current.length >= opts.maxMembers || chars + size > opts.maxChars)) {
      batches.push({ key: group.key, members: current });
      current = [];
      chars = 0;
    }
    current.push(memory);
    chars += size;
  }
  if (current.length > 0) batches.push({ key: group.key, members: current });
  return batches.filter((batch) => batch.members.length >= opts.minMembers);
}

/**
 * Group the pool by shared file/symbol/test anchor, then by the anchors'
 * directory for what is left, and cut groups into prompt-sized batches.
 * Largest batches first: they replace the most memories per model call.
 */
export function buildConsolidationBatches(
  pool: readonly Sage[],
  options: ConsolidationBatchOptions = {},
): ConsolidationBatch[] {
  const opts = {
    minMembers: options.minMembers ?? 3,
    maxMembers: options.maxMembers ?? 12,
    maxChars: options.maxChars ?? 12_000,
  };
  const byFile = groupBy(pool, pathAnchors, opts.minMembers);
  const byDirectory = groupBy(
    byFile.leftover,
    (memory) => [
      ...new Set(
        pathAnchors(memory)
          .map((p) => path.posix.dirname(p))
          // `packages/cli/tests` or `packages/tools/src` is a package, not a topic.
          .filter((dir) => dir.split('/').filter(Boolean).length >= MIN_TOPIC_DIRECTORY_SEGMENTS),
      ),
    ],
    opts.minMembers,
  );
  return [...byFile.groups, ...byDirectory.groups]
    .flatMap((group) => chunk(group, opts))
    .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

import { ulid } from '@wrongstack/core/utils';
import { reviewedTargetTexts, wasReviewedUnchanged } from './shared/candidate-dedupe.js';
import { applySemanticChange } from './shared/semantic-rewrite.js';
import type { SqliteHygieneContext } from './sqlite-hygiene-anchors.js';
import {
  compareIsoAscending,
  compareMemoryAgeAscending,
  hygieneScopeKey,
} from './sqlite-hygiene-anchors.js';
import { verifyHygieneMemories } from './sqlite-hygiene-verification.js';
import { readSqliteSageRow } from './sqlite-store-codec.js';
import { cleanReferencingMemories, memoryNodeId } from './sqlite-store-graph-helpers.js';
import {
  isNearDuplicateMemory,
  isPossiblyContradictory,
  normalizeAudience,
  normalizeTextKey,
} from './store-helpers.js';
import type {
  CandidateSuggestedAction,
  MemoryAnchor,
  Sage,
  SageHygieneOptions,
  SageHygieneReport,
} from './types.js';
import { DEFAULT_PERSISTENCE } from './types.js';

/** Cap pairwise near-dup work inside a single scope/kind/audience bucket. */
const HYGIENE_NEAR_DUP_BUCKET_CAP = 80;

/**
 * Importance at or above which a memory is user-designated critical, per the
 * triage pipeline's `pre-filter.ts` KEEP rule 1 and `action-dispatcher.ts`'s
 * "importance >= 0.9 memories never get destructive proposals" safety gate.
 * Hygiene must honor the same invariant: a memory the owner pinned as critical
 * is never *recommended for deletion* by an automatic pass — least of all on
 * the statistical `injected_never_used` signal, where non-use says nothing
 * about value. The review signal still surfaces, as `investigate`.
 */
const CRITICAL_IMPORTANCE_FLOOR = 0.9;

/**
 * Default age after which session-scoped memories without an explicit
 * `expiresAt` are soft-deleted by hygiene. Session scope is ephemeral by
 * contract; waiting for review candidates only pollutes the corpus.
 */
const DEFAULT_SESSION_RETENTION_DAYS = 7;

export async function runSqliteSageHygiene(
  ctx: SqliteHygieneContext,
  opts?: SageHygieneOptions,
): Promise<SageHygieneReport> {
  const startedAt = ctx.nowIso();

  const active = await ctx.listMemories({ status: 'active', limit: 0 });
  const { stale, verified, reactivated } = await verifyHygieneMemories({ opts, ctx, active });

  let deduplicated = 0;
  let superseded = 0;
  const allActive = await ctx.listMemories({ status: 'active', limit: 0 });
  const groups = new Map<string, Sage[]>();
  for (const m of allActive) {
    if (m.validity) continue; // Conditional claims require an explicit reviewed merge.
    const audienceKey = JSON.stringify(normalizeAudience(m.audience) ?? null);
    const key = `${hygieneScopeKey(m)}\0${normalizeTextKey(m.text)}\0${audienceKey}`;
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  await ctx.runMutation(() => {
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      // Re-read inside the mutation. A concurrent update can change the text,
      // scope, kind, or audience after the grouping snapshot above; a stale
      // row must not be written back or superseded as if it still matched.
      const currentGroup = group
        .map((observed) => readSqliteSageRow(ctx.stmt, observed.id))
        .filter((current): current is Sage => {
          if (current?.status !== 'active' || current.validity) return false;
          const audienceKey = JSON.stringify(normalizeAudience(current.audience) ?? null);
          const currentKey = `${hygieneScopeKey(current)}\0${normalizeTextKey(current.text)}\0${audienceKey}`;
          return currentKey === key;
        });
      if (currentGroup.length < 2) continue;
      const sorted = [...currentGroup].sort((a, b) => {
        const aPerm = (a.persistence ?? DEFAULT_PERSISTENCE) === 'permanent' ? 1 : 0;
        const bPerm = (b.persistence ?? DEFAULT_PERSISTENCE) === 'permanent' ? 1 : 0;
        return (
          bPerm - aPerm ||
          b.importance - a.importance ||
          b.confidence - a.confidence ||
          compareIsoAscending(a.createdAt, b.createdAt)
        );
      });
      const keeper = sorted[0]!;
      const duplicates = sorted.slice(1);
      const updatedKeeper = applySemanticChange(
        keeper,
        {
          tags: [...new Set(sorted.flatMap((m) => m.tags))],
          anchors: [
            ...new Map(
              [...sorted.flatMap((m) => m.anchors)].map((a) => [
                JSON.stringify(a, Object.keys(a).sort()),
                a,
              ]),
            ).values(),
          ] as MemoryAnchor[],
          sources: [...new Set(sorted.flatMap((m) => m.sources.map((s) => JSON.stringify(s))))].map(
            (s) => JSON.parse(s),
          ),
          supersedes: [...new Set([...(keeper.supersedes ?? []), ...duplicates.map((m) => m.id)])],
        },
        ctx.nowIso(),
      );
      ctx.upsertMemory(updatedKeeper);
      ctx.syncAnchorEdges(updatedKeeper);
      for (const dup of duplicates) {
        const supersededDup = applySemanticChange(
          dup,
          { status: 'superseded' as const, supersededBy: keeper.id },
          ctx.nowIso(),
        );
        ctx.upsertMemory(supersededDup);
        ctx.syncAnchorEdges(supersededDup);
        try {
          ctx
            .stmt(
              `INSERT INTO edges (from_node, to_node, relation, weight, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(from_node, to_node, relation) DO UPDATE SET weight = MAX(weight, excluded.weight)`,
            )
            .run(memoryNodeId(keeper.id), memoryNodeId(dup.id), 'supersedes', 1, ctx.nowIso());
        } catch {
          /* transient edge race — non-critical */
        }
        deduplicated++;
        superseded++;
      }
    }
    ctx.audit('memory.hygiene_dedup', { details: { deduplicated, superseded } });
  });

  // Near-duplicate pass: catch paraphrases that the exact-text key missed.
  // Remember-time merge already does this for new writes; hygiene heals
  // historical corpus that predated near-dup or arrived via import.
  // Opt-out via `nearDedup: false` for recall-tuning sessions.
  let transitiveMerges = 0;
  if (opts?.nearDedup !== false) {
    const nearActive = await ctx.listMemories({ status: 'active', limit: 0 });
    const nearBuckets = new Map<string, Sage[]>();
    for (const m of nearActive) {
      if (m.validity) continue;
      const audienceKey = JSON.stringify(normalizeAudience(m.audience) ?? null);
      const key = `${hygieneScopeKey(m)}\0${m.kind}\0${audienceKey}`;
      const bucket = nearBuckets.get(key);
      if (bucket) bucket.push(m);
      else nearBuckets.set(key, [m]);
    }
    await ctx.runMutation(() => {
      let nearPassDeduped = 0;
      for (const bucket of nearBuckets.values()) {
        if (bucket.length < 2) continue;
        const capped = [...bucket]
          .sort(
            (a, b) =>
              b.importance - a.importance ||
              b.confidence - a.confidence ||
              compareIsoAscending(a.createdAt, b.createdAt),
          )
          .slice(0, HYGIENE_NEAR_DUP_BUCKET_CAP);
        const parent = new Map<string, string>();
        const find = (id: string): string => {
          let cur = id;
          while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
            const next = parent.get(cur)!;
            parent.set(cur, parent.get(next) ?? next);
            cur = next;
          }
          if (!parent.has(cur)) parent.set(cur, cur);
          return cur;
        };
        const union = (a: string, b: string): void => {
          const ra = find(a);
          const rb = find(b);
          if (ra !== rb) parent.set(rb, ra);
        };
        for (let i = 0; i < capped.length; i++) {
          const left = capped[i]!;
          for (let j = i + 1; j < capped.length; j++) {
            const right = capped[j]!;
            // Skip pairs the contradiction pass is responsible for: merging a
            // polarity pair here would destroy the contradiction (e.g. "is
            // stable" vs "is not stable" would collapse into one memory).
            if (isNearDuplicateMemory(left, right) && !isPossiblyContradictory(left, right)) {
              union(left.id, right.id);
            }
          }
        }
        const mergedGroups = new Map<string, Sage[]>();
        for (const m of capped) {
          const root = find(m.id);
          const group = mergedGroups.get(root);
          if (group) group.push(m);
          else mergedGroups.set(root, [m]);
        }
        for (const group of mergedGroups.values()) {
          if (group.length < 2) continue;
          // Track raw union-find collapses (size > 2) before pair validation.
          if (group.length > 2) transitiveMerges++;
          const sorted = [...group].sort((a, b) => {
            const aPerm = (a.persistence ?? DEFAULT_PERSISTENCE) === 'permanent' ? 1 : 0;
            const bPerm = (b.persistence ?? DEFAULT_PERSISTENCE) === 'permanent' ? 1 : 0;
            return (
              bPerm - aPerm ||
              b.importance - a.importance ||
              b.confidence - a.confidence ||
              compareIsoAscending(a.createdAt, b.createdAt)
            );
          });
          const keeper = sorted[0]!;
          // Pair validation: only supersede members that are near-dup with the
          // keeper itself. Transitively connected-but-unrelated facts stay.
          const duplicates = sorted.slice(1).filter((dup) => isNearDuplicateMemory(keeper, dup));
          if (duplicates.length === 0) continue;
          const mergeSet = [keeper, ...duplicates];
          const richest = mergeSet.reduce((best, cur) =>
            cur.text.length > best.text.length ? cur : best,
          );
          const updatedKeeper = applySemanticChange(
            keeper,
            {
              text: richest.text.length > keeper.text.length ? richest.text : keeper.text,
              tags: [...new Set(mergeSet.flatMap((m) => m.tags))],
              anchors: [
                ...new Map(
                  [...mergeSet.flatMap((m) => m.anchors)].map((a) => [
                    JSON.stringify(a, Object.keys(a).sort()),
                    a,
                  ]),
                ).values(),
              ] as MemoryAnchor[],
              sources: [
                ...new Set(mergeSet.flatMap((m) => m.sources.map((s) => JSON.stringify(s)))),
              ].map((s) => JSON.parse(s)),
              supersedes: [
                ...new Set([...(keeper.supersedes ?? []), ...duplicates.map((m) => m.id)]),
              ],
            },
            ctx.nowIso(),
          );
          ctx.upsertMemory(updatedKeeper);
          ctx.syncAnchorEdges(updatedKeeper);
          for (const dup of duplicates) {
            const supersededDup = applySemanticChange(
              dup,
              { status: 'superseded' as const, supersededBy: keeper.id },
              ctx.nowIso(),
            );
            ctx.upsertMemory(supersededDup);
            ctx.syncAnchorEdges(supersededDup);
            try {
              ctx
                .stmt(
                  `INSERT INTO edges (from_node, to_node, relation, weight, created_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(from_node, to_node, relation) DO UPDATE SET weight = MAX(weight, excluded.weight)`,
                )
                .run(memoryNodeId(keeper.id), memoryNodeId(dup.id), 'supersedes', 1, ctx.nowIso());
            } catch {
              /* transient edge race — non-critical */
            }
            deduplicated++;
            superseded++;
            nearPassDeduped++;
          }
        }
      }
      if (nearPassDeduped > 0 || transitiveMerges > 0) {
        ctx.audit('memory.hygiene_near_dedup', {
          details: { nearPassDeduped, transitiveMerges, deduplicated, superseded },
        });
      }
    });
  }

  // ─── Contradiction detection (v1, deterministic) ─────────────────────
  // Active pairs in the same scope+audience bucket whose token sets overlap
  // ≥ the near-dup threshold and differ by a negation cue (not/no/never/…)
  // are flagged as possible contradictions. Consistent with how archive and
  // delete retention work, hygiene never flips statuses here: it emits an
  // 'investigate' review candidate for the newer member, links `contradicts`
  // on it, and counts the pair in the report so a human/agent can resolve it
  // (memory_update can set status 'contradicted' explicitly).
  let contradicted = 0;
  {
    const activeNow = await ctx.listMemories({ status: 'active', limit: 0 });
    const buckets = new Map<string, Sage[]>();
    for (const memory of activeNow) {
      // Opposite claims may both hold under different applicability conditions.
      if (memory.validity) continue;
      const audienceKey = JSON.stringify(normalizeAudience(memory.audience) ?? null);
      const key = `${hygieneScopeKey(memory)}\u0000${audienceKey}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(memory);
      else buckets.set(key, [memory]);
    }
    const flagged = new Map<string, { memory: Sage; other: Sage }>();
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      const capped = bucket.slice(0, HYGIENE_NEAR_DUP_BUCKET_CAP);
      for (let i = 0; i < capped.length; i++) {
        for (let j = i + 1; j < capped.length; j++) {
          const a = capped[i]!;
          const b = capped[j]!;
          if (!isPossiblyContradictory(a, b)) continue;
          // Skip pairs that are already linked — repeated hygiene runs must
          // not re-flag (and re-candidate) the same contradiction.
          if (a.contradicts?.includes(b.id) || b.contradicts?.includes(a.id)) continue;
          // Flag the newer member; the older one is the contradicted claim.
          const newer = compareMemoryAgeAscending(a, b) <= 0 ? b : a;
          const other = newer === a ? b : a;
          if (!flagged.has(newer.id)) flagged.set(newer.id, { memory: newer, other });
        }
      }
    }
    const pendingCandidates: Array<{ memory: Sage; other: Sage }> = [];
    if (flagged.size > 0) {
      await ctx.runMutation(() => {
        for (const { memory, other } of flagged.values()) {
          const contradictions = [...new Set([...(memory.contradicts ?? []), other.id])];
          const updated = applySemanticChange(
            memory,
            { contradicts: contradictions },
            ctx.nowIso(),
          );
          ctx.upsertMemory(updated);
          ctx.syncAnchorEdges(updated);
          pendingCandidates.push({ memory, other });
          contradicted++;
        }
        ctx.audit('memory.hygiene_contradictions', {
          details: { candidates: contradicted },
        });
      });
    }
    // Candidate creation is async and must not run inside the (synchronous)
    // mutation work; await it after the mutation commits. Failures are
    // best-effort — the contradicts link, audit event, and report count
    // already landed.
    for (const { memory, other } of pendingCandidates) {
      try {
        await ctx.addCandidate({
          id: ulid(),
          schemaVersion: 1,
          targetMemoryId: memory.id,
          text: memory.text,
          kind: 'memory_review',
          status: 'pending',
          scope: memory.scope,
          confidence: memory.confidence,
          importance: memory.importance,
          // E1: typed proposal metadata instead of review:/suggested:/
          // source: tag prefixes.
          reviewReason: `Possible contradiction with memory ${other.id}`,
          suggestedAction: 'investigate',
          tags: [...memory.tags],
          anchors: memory.anchors,
          sources: [{ type: 'session' }],
          createdAt: ctx.nowIso(),
          updatedAt: ctx.nowIso(),
        });
      } catch {
        // Best-effort — the contradicts link, audit event, and report count
        // already landed without the candidate.
      }
    }
  }

  const nowMs = ctx.now().getTime();
  const retentionMs = (opts?.retentionDays ?? 90) * 86_400_000;
  // 0 (or any non-positive / non-finite value) turns AGE-based session GC off,
  // like `purgeDeletedAfterDays`; an explicit `expiresAt` still applies. Read
  // as days, 0 made every session memory "aged out" — written seconds ago too.
  const sessionRetentionDays = opts?.sessionRetentionDays ?? DEFAULT_SESSION_RETENTION_DAYS;
  const sessionRetentionMs =
    Number.isFinite(sessionRetentionDays) && sessionRetentionDays > 0
      ? sessionRetentionDays * 86_400_000
      : Number.POSITIVE_INFINITY;
  const lowConfidenceMs = (opts?.archiveLowConfidenceAfterDays ?? 30) * 86_400_000;
  const unusedMs = (opts?.archiveUnusedAfterDays ?? 30) * 86_400_000;
  const unusedMinInjections = Math.max(1, Math.floor(opts?.unusedMinInjections ?? 10));

  const existingCandidates = await ctx.listCandidates(true);
  const existingPendingKeys = new Set(
    existingCandidates.filter((c) => c.status === 'pending').map((c) => c.targetMemoryId ?? ''),
  );
  const reviewedTexts = reviewedTargetTexts(existingCandidates, nowMs);

  let reviewCandidatesCreated = 0;
  let deleted = 0;
  let purgedDeleted = 0;
  const sessionGcTargets: Sage[] = [];
  const candidates = await ctx.listMemories({ status: 'all', limit: 0 });
  for (const m of candidates) {
    if (m.status === 'deleted' || m.status === 'superseded' || m.status === 'contradicted')
      continue;

    const age = nowMs - Date.parse(m.lastAccessedAt ?? m.updatedAt);
    const persistence = m.persistence ?? DEFAULT_PERSISTENCE;
    if (persistence === 'permanent') continue;

    // Session GC: soft-delete expired / aged-out session memories immediately.
    // These are ephemeral by contract; a review candidate only re-pollutes the
    // queue. Project-scope expiry still goes through the candidate path.
    const sessionExpired =
      m.scope === 'session' &&
      ((m.expiresAt !== undefined && Date.parse(m.expiresAt) <= nowMs) ||
        (m.expiresAt === undefined && nowMs - Date.parse(m.updatedAt) >= sessionRetentionMs));
    if (sessionExpired) {
      sessionGcTargets.push(m);
      continue;
    }

    let reason: string | undefined;
    let suggestedAction: 'delete' | 'archive' | 'investigate' = 'investigate';

    if (m.expiresAt && Date.parse(m.expiresAt) <= nowMs) {
      reason = 'expires_at_passed';
      suggestedAction = 'delete';
    } else if (
      m.status === 'active' &&
      m.scope !== 'session' &&
      // Audience memories are delivered into subagent system prompts, where
      // no usefulness signal is observed: every spawn counts an injection and
      // nothing can ever count a use, so this rule would flag every one of
      // them for deletion regardless of value.
      !m.audience &&
      (m.injectionCount ?? 0) >= unusedMinInjections &&
      (m.useCount ?? 0) === 0 &&
      // Age by injection activity (`age` = lastAccessedAt ?? updatedAt), not
      // content `updatedAt`: `recordInjection` no longer advances the content
      // clock, and a memory that keeps getting injected but never referenced
      // should only be flagged once it drops out of the rotation.
      age >= unusedMs
    ) {
      reason = 'injected_never_used';
      // Safety gate, mirroring the triage pipeline: a memory pinned as
      // critical is never *recommended for deletion* by this statistical
      // signal. The review candidate is still filed — as a non-destructive
      // `investigate` — so the unused-critical case stays visible to a human.
      suggestedAction = m.importance >= CRITICAL_IMPORTANCE_FLOOR ? 'investigate' : 'delete';
    } else if (
      (m.status === 'stale' && age >= retentionMs) ||
      (m.confidence < 0.5 && age >= lowConfidenceMs)
    ) {
      reason = m.confidence < 0.5 ? 'confidence_low' : 'freshness_low';
      suggestedAction = 'investigate';
    }

    if (reason && !existingPendingKeys.has(m.id) && !wasReviewedUnchanged(reviewedTexts, m)) {
      const ageDays = Math.floor((nowMs - Date.parse(m.updatedAt)) / 86_400_000);
      await ctx.addCandidate({
        id: ulid(),
        schemaVersion: 1,
        targetMemoryId: m.id,
        text: m.text,
        kind: 'memory_review',
        status: 'pending',
        scope: 'project',
        confidence: 0.6,
        importance: 0.4,
        // E1: proposal metadata is typed (reviewReason / suggestedAction)
        // instead of the legacy `review:` / `suggested:` tag prefixes.
        reviewReason: reason,
        suggestedAction: suggestedAction as CandidateSuggestedAction,
        tags: [
          ...m.tags,
          // Review context about the TARGET memory: candidates carry no
          // persistence field, so the target's class is conveyed via a tag.
          `persistence:${persistence}`,
        ],
        anchors: m.anchors,
        sources: [{ type: 'session' }],
        createdAt: ctx.nowIso(),
        updatedAt: ctx.nowIso(),
      });
      ctx.audit('memory.review_candidate_created', {
        memoryId: m.id,
        reason,
        details: {
          suggestedAction,
          ageDays,
          persistence,
          status: m.status,
          confidence: m.confidence,
        },
      });
      reviewCandidatesCreated++;
    }
  }

  if (sessionGcTargets.length > 0) {
    await ctx.runMutation(() => {
      for (const m of sessionGcTargets) {
        // Re-read inside the mutation — the same in-mutation re-read
        // convention as the purge, verification and reactivation passes.
        // The listing snapshot is stale by the time this queued mutation
        // runs, and a concurrent update or revive landing in that gap must
        // not be clobbered by it:
        //   - an aged-out session memory whose concurrent update just
        //     refreshed `updatedAt` is rescued (no longer expired);
        //   - an `expiresAt`-expired memory is still tombstoned, but built
        //     FROM the current row, so concurrent field changes and
        //     advisory counters survive into the (recoverable) tombstone
        //     instead of being silently reverted.
        const current = readSqliteSageRow(ctx.stmt, m.id);
        if (!current) continue;
        if (
          current.status === 'deleted' ||
          current.status === 'superseded' ||
          current.status === 'contradicted'
        ) {
          continue;
        }
        if ((current.persistence ?? DEFAULT_PERSISTENCE) === 'permanent') continue;
        const stillExpired =
          current.scope === 'session' &&
          ((current.expiresAt !== undefined && Date.parse(current.expiresAt) <= nowMs) ||
            (current.expiresAt === undefined &&
              nowMs - Date.parse(current.updatedAt) >= sessionRetentionMs));
        if (!stillExpired) continue;
        const tombstone: Sage = {
          ...current,
          status: 'deleted',
          revision: current.revision + 1,
          updatedAt: ctx.nowIso(),
          contextPolicy: 'never',
        };
        ctx.upsertMemory(tombstone);
        cleanReferencingMemories(ctx, m.id);
        ctx.cascadeDeleteEdges(memoryNodeId(m.id));
        ctx.audit('memory.session_gc', {
          memoryId: m.id,
          reason: current.expiresAt ? 'expires_at_passed' : 'session_retention',
          details: {
            expiresAt: current.expiresAt,
            updatedAt: current.updatedAt,
            sessionRetentionDays: opts?.sessionRetentionDays ?? DEFAULT_SESSION_RETENTION_DAYS,
          },
        });
        deleted++;
      }
    });
  }

  // Opt-in physical purge of old tombstones (including session GC).
  const purgeAfterDays = opts?.purgeDeletedAfterDays;
  if (typeof purgeAfterDays === 'number' && purgeAfterDays > 0) {
    const purgeCutoff = nowMs - purgeAfterDays * 86_400_000;
    const tombstones = await ctx.listMemories({ status: 'deleted', limit: 0 });
    const purgeIds = tombstones
      .filter((m) => {
        if ((m.persistence ?? DEFAULT_PERSISTENCE) === 'permanent') return false;
        const deletedAt = Date.parse(m.updatedAt);
        return Number.isFinite(deletedAt) && deletedAt <= purgeCutoff;
      })
      .map((m) => m.id);
    if (purgeIds.length > 0) {
      await ctx.runMutation(() => {
        const del = ctx.stmt('DELETE FROM memories WHERE id = ?');
        for (const id of purgeIds) {
          // Re-read inside the mutation: a concurrent revive (update/recovery)
          // can land between the tombstone listing above and this mutation —
          // the listing is a stale snapshot by the time the queued mutation
          // runs. Purging a now-live memory would be permanent data loss.
          // Same in-mutation re-read convention as the verification and
          // reactivation passes.
          const current = readSqliteSageRow(ctx.stmt, id);
          if (!current) continue;
          if (current.status !== 'deleted') continue;
          if ((current.persistence ?? DEFAULT_PERSISTENCE) === 'permanent') continue;
          ctx.cascadeDeleteEdges(memoryNodeId(id));
          del.run(id);
          purgedDeleted++;
        }
        ctx.audit('memory.purge_deleted', {
          details: { purgedDeleted, purgeDeletedAfterDays: purgeAfterDays },
        });
      });
    }
  }

  const report: SageHygieneReport = {
    startedAt,
    completedAt: ctx.nowIso(),
    examined: active.length,
    deduplicated,
    superseded,
    contradicted,
    staled: stale.length,
    reviewCandidatesCreated,
    archived: 0,
    archivedUnused: 0,
    deleted,
    purgedDeleted,
    verified: verified.length,
    reactivated: reactivated.length,
    transitiveMerges,
  };
  ctx.audit('memory.hygiene_completed', {
    details: report,
  });
  ctx.pruneAuditLog();
  return report;
}

/**
 * Journal side of the Chronicle file observer: turning reconciled changes into
 * pending events (rename pairing, tool attribution) and committing them in
 * chunks whose fingerprint state advances only once each chunk lands.
 */

import * as path from 'node:path';
import { normalizeRelative, resourceId } from './file-observer-scan.js';
import type {
  ChronicleFileObserverOptions,
  FileChange,
  FileFingerprint,
  PendingEvent,
  RecentToolMutation,
} from './file-observer-types.js';
import { CHRONICLE_MAX_APPEND_BATCH } from './project-server-protocol.js';
import type { ChronicleEventInput } from './types.js';

/**
 * Events per `appendBatch` call when flushing a reconcile pass. Matches the
 * project-server's own accept limit so a batch built here is never rejected
 * as oversized by the transport on the other side of the socket.
 */
const JOURNAL_FLUSH_CHUNK = CHRONICLE_MAX_APPEND_BATCH;

/**
 * Classify one reconcile pass's changes into journal events: delete+create
 * pairs with a matching content hash become renames, the rest become
 * created / modified / deleted events.
 */
export function buildPendingEvents(
  options: ChronicleFileObserverOptions,
  changes: readonly FileChange[],
  recentToolMutations: Map<string, RecentToolMutation>,
): PendingEvent[] {
  // Atomic saves and renames commonly arrive as delete+create. Matching the
  // last-known content hash preserves resource lineage when the OS provides
  // only generic "rename" notifications.
  const deleted = changes.filter((change) => change.before && !change.after);
  const created = changes.filter((change) => !change.before && change.after);
  const consumed = new Set<string>();
  // Journal events, each paired with the fingerprint-state writes that
  // may be applied only after that event's commit unit lands. Applying
  // state while inputs are still being built meant a flush that threw (a
  // chunk failure, a closed project-server socket) left `known` already
  // advanced past changes whose events were never written — and since
  // the pending set was drained, no later reconcile re-derived them:
  // audit events were permanently lost. Commit-unit pairing instead
  // advances state exactly as far as the journal actually committed, so
  // a retry after a partial flush re-derives only the remainder.
  const pendingEvents: PendingEvent[] = [];
  /**
   * Build one pending event: PEEK at (do not consume) the tool-attribution
   * hint for the changed path, build the journal input plus its deferred
   * live-activity emitter, and record the hint/key pair so the commit
   * callback can release it and the failure path can restore it.
   */
  const pushPending = (
    eventType: string,
    relativePath: string,
    state: FileFingerprint | undefined,
    attributes: Record<string, unknown>,
    stateWrites: Array<[relative: string, after: FileFingerprint | undefined]>,
  ): void => {
    const attribution = peekAttribution(relativePath, recentToolMutations);
    const { input, emitActivity } = buildMutation(
      options,
      eventType,
      relativePath,
      state,
      attributes,
      attribution,
    );
    pendingEvents.push({
      input,
      state: stateWrites,
      emitActivity,
      attribution,
      attributionKey: attribution ? relativePath : undefined,
    });
  };
  // Index the creates by content hash rather than rescanning the array for
  // every delete. A branch switch or a build drop can put thousands of
  // entries in BOTH lists, and the linear scan made this pass
  // O(deletes x creates). Buckets keep insertion order behind a cursor, so
  // each delete still claims the FIRST unclaimed create with a matching
  // hash — identical pairing to the `created.find(...)` it replaces.
  const createdByHash = new Map<string, { entries: FileChange[]; cursor: number }>();
  for (const to of created) {
    const hash = to.after?.hash;
    if (hash === undefined) continue;
    const bucket = createdByHash.get(hash);
    if (bucket) bucket.entries.push(to);
    else createdByHash.set(hash, { entries: [to], cursor: 0 });
  }
  const claimCreated = (hash: string): FileChange | undefined => {
    const bucket = createdByHash.get(hash);
    if (!bucket) return undefined;
    // The cursor never revisits an entry, so a create is claimed at most
    // once without consulting `consumed`.
    return bucket.cursor < bucket.entries.length ? bucket.entries[bucket.cursor++] : undefined;
  };
  for (const from of deleted) {
    const fromHash = from.before?.hash;
    if (fromHash === undefined) continue;
    const match = claimCreated(fromHash);
    if (!match) continue;
    consumed.add(from.relative);
    consumed.add(match.relative);
    pushPending(
      'file.external.renamed',
      match.relative,
      match.after,
      {
        operation: 'rename',
        previousPath: from.relative,
        previousResourceId: resourceId(from.relative),
        actor: 'external',
      },
      [
        [from.relative, undefined],
        [match.relative, match.after!],
      ],
    );
  }

  for (const change of changes) {
    if (consumed.has(change.relative)) continue;
    if (!change.after) {
      pushPending(
        'file.external.deleted',
        change.relative,
        change.before,
        {
          operation: 'delete',
          actor: 'external',
          previousHash: change.before?.hash,
          previousSize: change.before?.size,
        },
        [[change.relative, undefined]],
      );
    } else if (!change.before) {
      pushPending(
        'file.external.created',
        change.relative,
        change.after,
        {
          operation: 'write',
          actor: 'external',
        },
        [[change.relative, change.after]],
      );
    } else {
      pushPending(
        'file.external.modified',
        change.relative,
        change.after,
        {
          operation: 'edit',
          actor: 'external',
          previousHash: change.before.hash,
          previousSize: change.before.size,
        },
        [[change.relative, change.after]],
      );
    }
  }
  return pendingEvents;
}

/**
 * Build the Chronicle input for one reconciled change, plus the DEFERRED
 * live `file.activity` emitter that the caller fires at commit time.
 *
 * This used to `await journal.append(input)` itself, which meant one SQLite
 * transaction — and, at `synchronous = FULL`, one fsync — PER CHANGED FILE.
 * A `git checkout` touching 2000 files paid 2000 of them, serially: the
 * caller collected the promises and `Promise.all`-ed them, but node:sqlite is
 * a synchronous binding, so nothing overlapped. Building the input here and
 * committing the whole reconcile pass through {@link flushJournalInputs}
 * collapses that to a handful of transactions.
 *
 * The bus event moved from here to the commit callback for the same reason
 * the fingerprint state did: emitting at build time announced changes whose
 * journal write then failed, and the recovery re-derive announced them a
 * second time — duplicate live events for one filesystem change.
 */
function buildMutation(
  options: ChronicleFileObserverOptions,
  eventType: string,
  relativePath: string,
  state: FileFingerprint | undefined,
  attributes: Record<string, unknown>,
  attribution?: RecentToolMutation | undefined,
): { input: ChronicleEventInput; emitActivity?: (() => void) | undefined } {
  const context = typeof options.context === 'function' ? options.context() : options.context;
  const operation = attributes['operation'] as 'write' | 'edit' | 'delete' | 'rename';
  const bus = options.events;
  // The live `file.activity` bus event is DEFERRED to commit time — see
  // PendingEvent.emitActivity. The payload is still built here so `at`
  // reflects when the change was observed, not when the journal landed.
  // `as const` preserves the literal unions the EventBus payload type
  // requires now that the object is extracted instead of inline.
  const activity = {
    filePath: path.join(options.projectRoot, relativePath),
    operation,
    phase: 'changed',
    source: attribution ? 'tool' : 'external',
    at: Date.now(),
    sessionId: context.scope.sessionId,
    traceId: context.correlation.traceId,
    agentId: attribution?.agentId ?? context.scope.agentId,
    ...(attribution ? { toolUseId: attribution.toolUseId, toolName: attribution.toolName } : {}),
  } as const;
  const emitActivity: (() => void) | undefined = bus
    ? () => {
        bus.emit('file.activity', activity);
      }
    : undefined;
  const input: ChronicleEventInput = {
    eventType: attribution ? eventType.replace('.external.', '.tool.') : eventType,
    scope: {
      ...context.scope,
      ...(attribution?.sessionId ? { sessionId: attribution.sessionId } : {}),
      ...(attribution?.agentId ? { agentId: attribution.agentId } : {}),
    },
    correlation: {
      ...context.correlation,
      ...(attribution ? { toolCallId: attribution.toolUseId } : {}),
    },
    outcome: 'success',
    resource: {
      kind: 'file',
      id: resourceId(relativePath),
      path: normalizeRelative(relativePath),
      ...(state?.hash ? { contentHashAfter: state.hash } : {}),
    },
    attributes: {
      ...attributes,
      actor: attribution ? 'agent' : attributes['actor'],
      source: attribution ? 'tool' : 'external',
      toolName: attribution?.toolName,
      size: state?.size,
      mtimeMs: state?.mtimeMs,
      observedBy: 'fs.watch',
    },
  };
  return { input, emitActivity };
}

/**
 * Commit one reconcile pass's events, preferring the sink's batch entry point.
 *
 * Sinks predating `appendBatch` (and test doubles) fall back to starting every
 * `append` at once. That is deliberate, not laziness: the file-backed
 * `ChronicleJournal` coalesces whatever lands inside its 5ms batch window, so
 * awaiting the appends one at a time would drain the window between each and
 * turn one batch into N — the opposite of the point. Concurrent starts
 * reproduce exactly what this function replaced.
 *
 * The batch is chunked so a single enormous reconcile cannot build one
 * oversized frame for the project-server transport.
 *
 * `onCommitted` fires once per commit unit — after each `appendBatch` chunk
 * resolves, or after each individual `append` on the fallback path — with
 * exactly the events that just became durable. The caller applies those
 * events' fingerprint-state writes there, which is what keeps a mid-flush
 * failure from either losing unattempted events (state ahead of the journal)
 * or re-emitting committed ones (state behind the journal).
 */
export async function flushJournalInputs(
  options: ChronicleFileObserverOptions,
  events: readonly PendingEvent[],
  onCommitted: (committed: readonly PendingEvent[]) => void,
): Promise<void> {
  if (events.length === 0) return;
  const batch = options.journal.appendBatch?.bind(options.journal);
  if (!batch) {
    // Wait for EVERY append to settle before surfacing any failure.
    // Promise.all's fail-fast hands the rejection to the caller while
    // sibling appends are still in flight; their commits then land after
    // the recovery rescan has already re-derived them — duplicate audit
    // events. allSettled lets every fulfilled append apply its state (via
    // onCommitted) first, so `known` ends exactly at the journal's
    // frontier no matter which appends failed.
    const settled = await Promise.allSettled(
      events.map(async (event) => {
        await options.journal.append(event.input);
        onCommitted([event]);
      }),
    );
    const failure = settled.find((result) => result.status === 'rejected');
    if (failure) throw (failure as PromiseRejectedResult).reason;
    return;
  }
  for (let index = 0; index < events.length; index += JOURNAL_FLUSH_CHUNK) {
    const chunk = events.slice(index, index + JOURNAL_FLUSH_CHUNK);
    await batch(chunk.map((event) => event.input));
    onCommitted(chunk);
  }
}

/**
 * PEEK at the tool-mutation hint for a path without consuming it.
 *
 * Claim/release is tied to the journal commit, not the build: the hint is
 * released only when its event's commit unit lands (see the onCommitted
 * callback in reconcile) and restored with a fresh `at` when the flush
 * fails, so the recovery pass re-attributes the change as `file.tool.*`
 * with its original correlation. Popping at build time — the old behavior
 * — meant a failed flush permanently lost the attribution and the retry
 * degraded the event to `file.external.*`.
 *
 * Stale (>2s) hints are reported as no attribution but deliberately left
 * in the map: they age out via the size cap or are overwritten by the next
 * hint for the same path.
 */
function peekAttribution(
  relativePath: string,
  recent: Map<string, RecentToolMutation>,
): RecentToolMutation | undefined {
  const value = recent.get(relativePath);
  if (!value) return undefined;
  return Date.now() - value.at <= 2_000 ? value : undefined;
}

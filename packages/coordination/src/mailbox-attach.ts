/**
 * mailbox-attach — composition glue for the agent-loop mailbox checker.
 *
 * Lives at the src root (composition layer) because it resolves the concrete
 * project mailbox from coordination/ and hands the resulting checker to
 * core/ — core/ itself may only depend on the Mailbox interface
 * (architecture Rule 3, see tests/architecture/package-boundaries.test.ts).
 *
 * The mailbox it resolves is the *server-backed* one: the detached project
 * owner holds the only SQLite handle and every surface reaches it over IPC.
 * This module used to construct a direct-filesystem `GlobalMailbox`, which
 * put the agent loop — registration, heartbeat, delivery, ack — on a private
 * `_mailbox.jsonl` while every UI read `_mailbox.sqlite`. That split is the
 * exact failure the project-daemon invariant exists to prevent.
 *
 * @module mailbox-attach
 */

import type { FleetConfig } from '@wrongstack/contracts/types/config';
import type {
  MailboxHqPublisherFactory,
  MailboxHqPublisherPort,
} from '@wrongstack/contracts/types/hq-mailbox-publisher';
import type { AgentInternals } from '@wrongstack/core/agent';
import {
  buildFleetPulseBlock,
  buildMailboxBtwAwarenessBlock,
  createMailboxChecker,
  fleetPulseSignature,
  resolveChimeraReportSessionResolver,
  resolveHqMailboxPublisherFactory,
  setBtwNote,
} from '@wrongstack/core/agent';
import { toErrorMessage, wstackGlobalRoot } from '@wrongstack/core/utils';
import { resolveProjectDir } from './global-mailbox-paths.js';
import {
  MAILBOX_AWARENESS_INTERVAL_MS,
  MAILBOX_HEARTBEAT_INTERVAL_MS,
  PULSE_MIN_READ_INTERVAL_MS,
} from './mailbox-constants.js';
import { mailboxSessionTag, resolveMailboxIdentity } from './mailbox-tool.js';
import type { Mailbox, MailboxMessage } from './mailbox-types.js';
import {
  acceptMailboxMessageForSession,
  MAILBOX_TYPE_PROPERTIES,
  type MailboxSessionAffinityContext,
} from './mailbox-types.js';
import { getSharedProjectMailbox } from './remote-mailbox.js';

/**
 * Process-wide HQ mailbox publishers, keyed by project root + surface.
 *
 * The socket carries mailbox telemetry only. It deliberately does NOT declare
 * `session.summary`: that is what marks a terminal surface, and HQ would then
 * render this as a phantom "waiting for session telemetry" node and
 * orphan-evict it (terminate → reconnect churn) because it never publishes a
 * session snapshot.
 */
const mailboxHqPublishers = new Map<
  string,
  { publisher: MailboxHqPublisherPort | undefined; refs: number }
>();

function mailboxHqPublisherKey(projectRoot: string, source: 'cli' | 'webui'): string {
  return `${source}::${projectRoot}`;
}

function acquireMailboxHqPublisher(
  projectRoot: string,
  source: 'cli' | 'webui',
  logger: AgentInternals['logger'],
  createPublisher: MailboxHqPublisherFactory | undefined,
): MailboxHqPublisherPort | undefined {
  const key = mailboxHqPublisherKey(projectRoot, source);
  const existing = mailboxHqPublishers.get(key);
  if (existing !== undefined) {
    existing.refs += 1;
    return existing.publisher;
  }
  const publisher = createPublisher?.({
    clientKind: source,
    projectRoot,
    logger,
    capabilities: ['telemetry.publish', 'mailbox.summary'],
  });
  publisher?.connect();
  // Cached even when HQ is disabled (undefined): the refcount still has to
  // balance, and re-deciding per Agent would re-read the config every time.
  mailboxHqPublishers.set(key, { publisher, refs: 1 });
  return publisher;
}

function releaseMailboxHqPublisher(projectRoot: string, source: 'cli' | 'webui'): void {
  const key = mailboxHqPublisherKey(projectRoot, source);
  const entry = mailboxHqPublishers.get(key);
  if (entry === undefined) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  mailboxHqPublishers.delete(key);
  entry.publisher?.close();
}

/** Test seam: drop every cached publisher without waiting for refcounts. */
export function resetMailboxHqPublishersForTests(): void {
  for (const entry of mailboxHqPublishers.values()) entry.publisher?.close();
  mailboxHqPublishers.clear();
}

export function attachMailboxChecker(
  a: AgentInternals,
  source?: 'cli' | 'webui',
): () => Promise<MailboxMessage[]> {
  // Mailbox integration is best-effort — it must NEVER be the reason Agent
  // construction fails. Ephemeral/test contexts without a projectRoot get a
  // no-op checker, and any setup error degrades to the same.
  if (!a.ctx.projectRoot) {
    return async () => [];
  }
  try {
    return attachMailboxCheckerInner(a, source);
  } catch {
    return async () => [];
  }
}

function attachMailboxCheckerInner(
  a: AgentInternals,
  source?: 'cli' | 'webui',
): () => Promise<MailboxMessage[]> {
  // Lazy mailbox getter: re-derives projectRoot on every call so that
  // an in-process project switch (which mutates a.ctx.projectRoot) is
  // picked up automatically without re-creating the loop handler.
  const getMailbox = (): Mailbox => {
    const projectDir = resolveProjectDir(a.ctx.projectRoot, wstackGlobalRoot());
    return getSharedProjectMailbox(projectDir, a.events, hqPublisher);
  };
  // Pass the agent's EventBus so the mailbox can re-emit the project owner's
  // real-time events (agent_registered, agent_heartbeat, etc.) for TUI/WebUI
  // display.
  // One socket per PROCESS, not per Agent. `attachMailboxChecker` runs for
  // every Agent the process builds — the leader and each subagent — so a
  // per-Agent publisher meant a fleet of five workers opened five extra HQ
  // sockets that all report the same project mailbox. Worse, HQ supersedes
  // same-class sockets from one pid: each new one closed its siblings, they
  // reconnected, closed it back, and the process sat in a permanent
  // reconnect ping-pong that churned HQ's client list. Shared and refcounted,
  // there is exactly one.
  // The refcount key is captured ONCE. An in-place project switch mutates
  // `a.ctx.projectRoot`, so releasing by the live value decremented the NEW
  // project's entry — leaking the old publisher and closing a socket other
  // agents still held by value.
  const surface = source ?? (a.ctx.meta['source'] as 'cli' | 'webui' | undefined) ?? 'cli';
  if (!a.ctx.meta['source']) a.ctx.meta['source'] = surface;
  const acquiredRoot = a.ctx.projectRoot;
  const acquiredSource = surface;
  const hqPublisher = acquireMailboxHqPublisher(
    acquiredRoot,
    acquiredSource,
    a.logger,
    resolveHqMailboxPublisherFactory(a.container),
  );
  // Agent-level hook: the HQ publisher (and its cached disabled entry) lives
  // across runs, not per-run, and must always balance its refcount on dispose.
  a.ctx.registerAgentHook(() => releaseMailboxHqPublisher(acquiredRoot, acquiredSource));

  // SESSION-bound unique identity (`<base>@<sessionTag>`): every session
  // has its own id, so two leader sessions on the same project never
  // collide — and the identity is re-derived LIVE so an in-process session
  // swap (resume / session.new / project switch) moves the agent onto the
  // new session's identity automatically. ctx.meta.globalAgentId is kept
  // fresh for the tools and the /mailbox command.
  const baseIdOf = (): string => {
    const fieldId = a.ctx.agentId && a.ctx.agentId !== 'unknown' ? a.ctx.agentId : undefined;
    return (a.ctx.meta['agentId'] as string | undefined) ?? fieldId ?? 'leader';
  };
  /**
   * The session this agent's mailbox identity belongs to.
   *
   * `meta.sessionId` is the OWNING-session stamp: a subagent given its own
   * journal has a `ctx.session.id` that names its private transcript, not the
   * conversation that spawned it, so tagging and registering off the writer
   * filed workers under a session no surface is showing. Leaders carry no
   * stamp and keep the live re-derivation below, which is what moves them
   * onto the new identity across a resume / session.new / project switch.
   */
  const identitySessionId = (): string => {
    const owning = a.ctx.meta['sessionId'];
    return typeof owning === 'string' && owning.length > 0 ? owning : a.ctx.session.id;
  };
  let registeredAs = '';
  const ensureRegistered = (): string => {
    // Clear a stale explicit override from a previous session so the
    // resolver re-derives from the CURRENT session id.
    const derived = `${baseIdOf()}@${mailboxSessionTag(identitySessionId())}`;
    if ((a.ctx.meta['globalAgentId'] as string | undefined) !== derived) {
      a.ctx.meta['globalAgentId'] = derived;
    }
    if (registeredAs !== derived) {
      registeredAs = derived;
      const identity = resolveMailboxIdentity(a.ctx);
      getMailbox()
        .registerAgent({
          agentId: derived,
          name: `${identity.name} [${surface}]`,
          role: identity.role,
          sessionId: identitySessionId(),
          pid: process.pid,
          source: surface,
        })
        .catch((err: unknown) => {
          // Log but don't fail - registration errors shouldn't crash the agent
          a.logger.debug(`Failed to register agent ${derived}`, {
            agentId: derived,
            err: toErrorMessage(err),
          });
        });
    }
    return derived;
  };
  ensureRegistered();

  // Heartbeat keeps the registration alive (every 30 seconds) and follows
  // identity changes — after a session swap the new identity registers and
  // the old one simply goes stale (60s timeout).
  const HEARTBEAT_INTERVAL_MS = MAILBOX_HEARTBEAT_INTERVAL_MS;
  const heartbeatTimer = setInterval(() => {
    const id = ensureRegistered();
    // Identity rides along on every heartbeat so the daemon can REBUILD this
    // row if it was pruned (>AGENT_STALE_MS, e.g. after a sleep/starvation gap,
    // or by any observer calling getAgentStatuses()). ensureRegistered() cannot
    // do it: it early-returns on an unchanged identity and never re-registers.
    // Must mirror the registerAgent payload above so a rebuilt row is identical.
    const identity = resolveMailboxIdentity(a.ctx);
    getMailbox()
      .heartbeat({
        agentId: id,
        sessionId: identitySessionId(),
        name: `${identity.name} [${surface}]`,
        role: identity.role,
        pid: process.pid,
        source: surface,
      })
      .catch(() => {
        // Silently ignore - heartbeat failures are expected during shutdown
      });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  // Register cleanup to stop heartbeat on agent teardown. Note: there's no
  // unregisterAgent method — agents are considered offline after their heartbeat
  // expires (60s timeout). Agent-level: the heartbeat runs across runs.
  a.ctx.registerAgentHook(() => {
    clearInterval(heartbeatTimer);
  });

  // Receive on the unique id AND the bare base id (plus '*' broadcasts) —
  // "send to leader" reaches every live leader session on the project.
  // Getter form: each check re-derives identity from the CURRENT session.
  const mailboxCheckerOptions = {
    mailbox: getMailbox,
    agentId: () => ensureRegistered(),
    role: () => resolveMailboxIdentity(a.ctx).role,
    aliases: [baseIdOf()],
    sessionId: () => identitySessionId(),
    // ACK is deferred to the session-affinity wrapper so messages dropped
    // by the filter are NOT marked as read by this agent.
    ack: false as const,
  };
  const checkMailbox = createMailboxChecker({
    ...mailboxCheckerOptions,
    // The session-affinity wrapper owns delivered-message dedup (see
    // applySessionAffinityFilter below). With inner tracking left enabled,
    // a message dropped by the filter — its sessionAffinity token naming
    // another session — was consumed by the inner `injectedIds` set on its
    // first poll and could never redeliver after an in-process session
    // swap (resume / session.new / project switch) to the matching
    // session, even though the session is re-derived live by design.
    // Dropped messages must stay redeliverable until they are acked.
    trackInjected: false as const,
  });

  // Session-affinity filter: wrap the checker so cross-session chimera
  // reports (those carrying a `sessionAffinity` token) are dropped at the
  // receiver for any leader whose current session id does NOT match the
  // message's `sessionAffinity.sessionId`. The wrapper composes with the
  // existing audience filter (`isMailboxMessageVisibleTo`) — a message
  // must pass BOTH filters to reach the agent-loop inbox.
  //
  // Re-derive `currentSessionId` on every call so that an in-process
  // session swap (resume / session.new / project switch) is honored
  // without recreating the checker.
  //
  // ACK ORDERING: the inner checker is created with `ack: false` so the
  // session-affinity filter runs BEFORE any read receipts are stamped.
  // Only messages that survive the filter are acked, by the wrapper,
  // in a single batched call — preserving both the batching optimization
  // and the invariant that a message is never marked "read by agent X"
  // when agent X actually dropped it.
  const reportSessionResolver = resolveChimeraReportSessionResolver(a.container);
  const sessionAffinityCtx: MailboxSessionAffinityContext = {
    resolveChimeraReportSessionId: reportSessionResolver
      ? (reportId: string) =>
          reportSessionResolver(resolveProjectDir(a.ctx.projectRoot, wstackGlobalRoot()))?.(
            reportId,
          )
      : undefined,
  };
  /**
   * Filter messages by session affinity. Shared by inline and awareness
   * checkers — see the exported applySessionAffinityFilter below for the
   * contract. The deps are wired here so an in-process session swap is
   * honored without recreating the checker.
   */
  // Cross-path delivered-id ledger shared by the inline and awareness
  // wrappers. The wrappers previously kept independent dedup sets, so the
  // same mail surfaced twice per iteration — once as a [MAILBOX BTW]
  // awareness preview and again inside the inline [MAILBOX] block. The
  // ledger makes "surfaced to the model" a once-per-message fact across
  // both paths (backgroundEligible types still re-deliver inline after a
  // preview: the preview is awareness-only, the inline block is the
  // canonical delivery with its action guidance).
  const sharedDeliveredIds = new Set<string>();
  const sessionAffinityWrapperDeps = {
    getSessionId: identitySessionId,
    getAgentId: ensureRegistered,
    getMailbox,
    affinityCtx: sessionAffinityCtx,
    sharedDeliveredIds,
  };
  const sessionScopedCheckMailbox = applySessionAffinityFilter(
    checkMailbox,
    true,
    sessionAffinityWrapperDeps,
  );

  const checkMailboxAwareness = createMailboxChecker({
    ...mailboxCheckerOptions,
    // Exclude out-of-band types (control) from awareness polling.
    // Uses the canonical MAILBOX_TYPE_PROPERTIES outOfBand flag instead
    // of a hardcoded type string, so a newly-added out-of-band type is
    // automatically excluded.
    include: (m) => !MAILBOX_TYPE_PROPERTIES[m.type]?.outOfBand,
    ack: false,
    // The awareness wrapper owns accepted-message dedup, mirroring the
    // inline checker. With inner tracking left enabled, an affinity-dropped
    // message was consumed by the inner `injectedIds` set on its first
    // poll and could never preview after an in-process session swap —
    // the same bug class `trackInjected: false` fixed for the inline
    // checker (see the session-affinity redelivery suite, whose
    // "production awareness construction" comment already assumed this).
    trackInjected: false as const,
  });
  const sessionScopedCheckMailboxAwareness = applySessionAffinityFilter(
    checkMailboxAwareness,
    false,
    sessionAffinityWrapperDeps,
  );

  // Background mailbox awareness: poll while tools or long provider calls are
  // in flight, but queue the result as a BTW note so the agent only consumes it
  // at the next safe loop boundary. This is the important separation: polling
  // is continuous, conversation mutation remains serialized by the agent loop.
  //
  // PUSH-NOTIFICATION SHORT-CIRCUIT: the project owner emits
  // 'mailbox.message_sent' on every send() and broadcasts it to every
  // connected client, which re-emits it on this agent's EventBus. We
  // subscribe to that event and trigger an immediate (debounced) awareness
  // poll — so a message surfaces in <500ms instead of waiting up to the full
  // poll interval. Since the owner is shared, this now covers cross-process
  // sends too; the 30s interval remains as a fallback for a dropped socket.
  const AWARENESS_FALLBACK_INTERVAL_MS = MAILBOX_AWARENESS_INTERVAL_MS; // cross-process fallback
  const AWARENESS_PUSH_DEBOUNCE_MS = 500; // collapse bursts from the same sender
  let pollInFlight = false;
  let awarenessDisposed = false;
  let pushDebounceTimer: NodeJS.Timeout | null = null;

  const pollMailboxAwareness = async () => {
    if (awarenessDisposed || pollInFlight) return;
    pollInFlight = true;
    try {
      const messages = await sessionScopedCheckMailboxAwareness();
      if (!awarenessDisposed && messages.length > 0) {
        setBtwNote(a.ctx, buildMailboxBtwAwarenessBlock(messages).text);
      }
    } catch {
      // Best-effort awareness only — a broken mailbox must not disturb work.
    } finally {
      pollInFlight = false;
    }
  };

  // Push-triggered poll: debounce so a rapid burst of messages (e.g. a
  // subagent sending 5 results) collapses into a single poll after 500ms
  // rather than firing 5 polls.
  const triggerPushPoll = () => {
    if (awarenessDisposed) return;
    if (pushDebounceTimer !== null) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => {
      pushDebounceTimer = null;
      void pollMailboxAwareness();
    }, AWARENESS_PUSH_DEBOUNCE_MS);
  };

  // Subscribe to 'mailbox.message_sent' for push-based awareness. The project
  // owner emits it on every send(); the local connection re-emits it here.
  let pushUnsub: (() => void) | null = null;
  if (a.events && typeof a.events.onPattern === 'function') {
    pushUnsub = a.events.onPattern('mailbox.message_sent', () => {
      triggerPushPoll();
    });
  }

  // Fallback polling for cross-process messages (other terminal sessions,
  // external agents via the HTTP bridge). These don't trigger the in-process
  // EventBus event, so we still need periodic polling — just less frequently.
  const awarenessTimer = setInterval(() => {
    void pollMailboxAwareness();
  }, AWARENESS_FALLBACK_INTERVAL_MS);
  awarenessTimer.unref?.();
  a.ctx.registerAgentHook(() => {
    awarenessDisposed = true;
    clearInterval(awarenessTimer);
    if (pushDebounceTimer !== null) clearTimeout(pushDebounceTimer);
    pushUnsub?.();
  });

  // Auto-compaction (drop messages read by every online agent, expired TTLs,
  // stale completed/incomplete records) is NOT started here: the detached
  // project owner runs exactly one compaction timer for the whole project
  // (`mailbox-project-server.ts` → `startAutoCompactTimer`). Starting a
  // per-agent timer would have N sessions compacting the same store.

  return sessionScopedCheckMailbox;
}

/**
 * Filter messages by session affinity. Shared by inline and awareness
 * checkers. The `ack` flag controls whether the wrapper batch-acks accepted
 * messages:
 *   - inline checker: ack=true (messages are delivered to the agent loop)
 *   - awareness checker: ack=false (preview only; actionable messages
 *     must stay unread so the inline checker can still deliver them)
 *
 * Exported so the regression suite can exercise THIS composition directly —
 * the swap-redelivery contract is a property of the wrapper and the inner
 * checker's `trackInjected` setting together, not of either alone.
 */
export function applySessionAffinityFilter(
  checker: () => Promise<MailboxMessage[]>,
  ack: boolean,
  deps: {
    /** Current session id — re-derived per call, honoring in-process swaps. */
    getSessionId: () => string;
    /** Unique mailbox identity for ack receipts. Only called when ack=true. */
    getAgentId: () => string;
    getMailbox: () => Mailbox;
    affinityCtx: MailboxSessionAffinityContext;
    /**
     * Cross-path delivered-id ledger shared with the sibling wrapper
     * (inline ↔ awareness). Optional so composition tests can exercise the
     * wrapper in isolation; the production composition always passes it.
     * Semantics: awareness never previews an id the ledger already holds,
     * and the inline path absorbs (acks without re-injecting)
     * awareness-only types — `backgroundEligible: false` — that a preview
     * already surfaced.
     */
    sharedDeliveredIds?: Set<string>;
  },
): () => Promise<MailboxMessage[]> {
  // Accepted-message dedup, owned by the wrapper because both production
  // inner checkers use `trackInjected: false`. That keeps a wrapper-DROPPED
  // message (its sessionAffinity token names another session) redeliverable
  // across an in-process session swap to the matching session. Once accepted,
  // however, a message must be returned only once even when this is the
  // non-acking awareness wrapper; otherwise every fallback poll turns the
  // same HQ FYI/BTW into another pending BTW note. Same 1000/500 GC shape as
  // createMailboxChecker's injectedIds.
  const deliveredIds = new Set<string>();
  return async (): Promise<MailboxMessage[]> => {
    const currentSessionId = deps.getSessionId();
    // Capture the identity BEFORE awaiting the checker, so the ack is
    // stamped by the same identity that read the messages. The identity
    // getter re-derives from the live session on every call, so an
    // in-process session swap that lands mid-check would otherwise ack
    // under the NEW identity messages the OLD one read — leaving them
    // unread for the new session and marked read for a session that
    // never saw them.
    //
    // `null` here means "awareness pass, do not ack" — it is the ternary,
    // not a failure mode of the identity getter (which always returns a
    // string). The `&& agentId` in the ack guard below is the narrowing
    // that lets TypeScript see that.
    const agentId = ack ? deps.getAgentId() : null;
    const messages = await checker();
    const shared = deps.sharedDeliveredIds;
    const filtered: MailboxMessage[] = [];
    // Awareness-only types already surfaced by the sibling path are
    // absorbed here: acked so the mailbox state stays clean, but NOT
    // returned — the model saw the body once and must not see it again.
    const absorbed: MailboxMessage[] = [];
    for (const m of messages) {
      if (deliveredIds.has(m.id)) continue;
      if (!(await acceptMailboxMessageForSession(m, currentSessionId, deps.affinityCtx))) {
        continue;
      }
      const alreadySurfaced = shared?.has(m.id) ?? false;
      if (ack) {
        // Inline delivery. A backgroundEligible type (ask/assign/steer/
        // review/result) is delivered even after a preview: the preview
        // was awareness-only, this block is the canonical delivery with
        // its action guidance and acknowledgement footer.
        if (alreadySurfaced && !MAILBOX_TYPE_PROPERTIES[m.type]?.backgroundEligible) {
          absorbed.push(m);
        } else {
          filtered.push(m);
        }
      } else {
        // Awareness preview. Skip anything the inline path already
        // delivered or absorbed — surfacing it again is pure noise.
        if (alreadySurfaced) continue;
        filtered.push(m);
      }
      deliveredIds.add(m.id);
      shared?.add(m.id);
    }
    // Batch-ack only when requested (inline delivery). Awareness must
    // NOT ack — otherwise actionable messages are consumed before the
    // inline checker can deliver them. Absorbed messages are acked too:
    // "read" means the model saw this content once (via the preview).
    if (ack && filtered.length + absorbed.length > 0 && agentId) {
      void deps
        .getMailbox()
        .ackMany({
          acks: [...filtered, ...absorbed].map((m) => ({
            messageId: m.id,
            readerId: agentId,
            read: true,
          })),
        })
        .catch(() => {});
    }
    // GC — mirrors createMailboxChecker's injectedIds trim.
    if (deliveredIds.size > 1000) {
      const recent = new Set([...deliveredIds].slice(-500));
      deliveredIds.clear();
      for (const id of recent) deliveredIds.add(id);
    }
    if (shared && shared.size > 1000) {
      const recent = [...shared].slice(-500);
      shared.clear();
      for (const id of recent) shared.add(id);
    }
    return filtered;
  };
}

/**
 * Fleet-pulse provider: returns a fresh "[FLEET PULSE]" digest block when
 * (a) the read throttle allows, (b) at least one online peer exists, and
 * (c) the peer picture actually changed since the last injected pulse.
 * Otherwise `null`. Same best-effort posture as the mailbox checker — any
 * failure degrades to "no pulse", never to a thrown error.
 */
export function attachFleetPulse(
  a: AgentInternals,
  cfg?: FleetConfig['pulse'],
): () => Promise<{ type: 'text'; text: string } | null> {
  if (!a.ctx.projectRoot || cfg?.enabled === false) {
    return async () => null;
  }
  try {
    let lastProjectDir = '';
    let lastReadAt = 0;
    let lastSignature = '';
    return async () => {
      try {
        if (!a.ctx.projectRoot) return null;
        const projectDir = resolveProjectDir(a.ctx.projectRoot, wstackGlobalRoot());
        if (projectDir !== lastProjectDir) {
          lastProjectDir = projectDir;
          lastReadAt = 0;
          lastSignature = '';
        }
        const now = Date.now();
        if (now - lastReadAt < PULSE_MIN_READ_INTERVAL_MS) return null;
        lastReadAt = now;
        // No EventBus/HQ publisher here — the pulse is a read-only registry
        // consumer; the checker's mailbox instance already owns event emission.
        const mailbox: Mailbox = getSharedProjectMailbox(projectDir);
        const statuses = await mailbox.getAgentStatuses();
        const selfId =
          (a.ctx.meta['globalAgentId'] as string | undefined) ??
          `${a.ctx.agentId ?? 'leader'}@${mailboxSessionTag(a.ctx.session.id)}`;
        const online = statuses.filter((s) => s.online && s.agentId !== selfId);
        const signature = fleetPulseSignature(online);
        if (online.length === 0 || signature === lastSignature) return null;
        const block = buildFleetPulseBlock(statuses, {
          selfId,
          maxAgents: cfg?.maxAgents,
          maxChars: cfg?.maxChars,
        });
        if (block) lastSignature = signature;
        return block;
      } catch {
        return null;
      }
    };
  } catch {
    return async () => null;
  }
}

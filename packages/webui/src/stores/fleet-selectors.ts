import { compareAgentsByActivity } from '@/lib/agent-status';
import type {
  AgentTranscriptEntry,
  FleetTimelineEvent,
  SubagentEvent,
  SubagentView,
} from './types.js';

export interface FleetState {
  agents: Map<string, SubagentView>;
  /**
   * Process-wide LAST-ANNOUNCED leader (set via leader_updated). Tab-scoped
   * consumers must use `selectSessionLeaderId` / `useSessionLeaderId`, which
   * resolve the leader of ONE session from the roster's isLeader flag.
   */
  leaderId: string | undefined;
  /** Fleet-wide aggregated tokens (sum of all agent tokens). */
  fleetTokensIn: number;
  fleetTokensOut: number;
  /** Current / max concurrency from server. */
  fleetConcurrency: number;
  fleetConcurrencyMax: number;
  /** Lifetime spawn budget from server (issue #323). Undefined until first budget frame. */
  fleetMaxSpawns: number | undefined;
  fleetUsedSpawns: number | undefined;
  fleetRemainingSpawns: number | undefined;
  fleetBudgetSource: string | undefined;
  fleetCheckpointMaxSpawns: number | undefined;
  fleetCeilingMismatch: boolean;
  /** Last 20 fleet events for the Fleet Monitor timeline. */
  eventTimeline: FleetTimelineEvent[];
  /** Agent conversation timeline entries (agent.timeline.message + agent.status_changed). */
  agentTimeline: AgentTranscriptEntry[];
  /** Per-agent ordered chat transcripts (oldest first). */
  agentTranscripts: Map<string, AgentTranscriptEntry[]>;
  applyEvent: (e: SubagentEvent) => void;
  pushAgentTimelineEntry: (entry: Omit<AgentTranscriptEntry, 'id'>) => void;
  clear: () => void;
  /** Return all agents belonging to a session. Used for project-scoped filtering. */
  getAgentsBySession: (sessionId: string) => SubagentView[];
  /** Return one agent's full ordered transcript. */
  getAgentTranscript: (subagentId: string) => AgentTranscriptEntry[];
  /** Hydrate subagent virtual sessions and historical transcripts (from session.start replay). */
  hydrateAgentSessions: (
    sessions: Array<{
      subagentId: string;
      agentName?: string | undefined;
      status?: string | undefined;
      task?: string | undefined;
      transcript?: AgentTranscriptEntry[] | undefined;
    }>,
    sessionId?: string | undefined,
  ) => void;
  /** Remove non-running agents (completed, failed, timeout, stopped) from the
   *  roster. Scoped: only agents belonging to `sessionId` are removed, so a
   *  panel in one tab never drops another tab's finished agents. */
  clearFinishedAgents: (sessionId: string | null) => void;
  /** Remove ONE agent from the roster (AgentTabs close affordance). Same
   *  cleanup path as clearFinishedAgents — transcripts, timelines, token
   *  totals and the leader pointer all follow the agent out. */
  removeAgent: (subagentId: string) => void;
}

// ── Derived selectors ──────────────────────────────────────────────────
//
// These can be called directly against store state. When subscribing to a
// selector that returns a new object or array, wrap it with Zustand's
// `useShallow` so useSyncExternalStore receives a reference-stable snapshot:
//
//   const summary = useFleetStore(useShallow(selectFleetSummary));
//
// The local `shallow` export below remains available for direct comparisons.

/** Pre-computed fleet-wide summary statistics. */
export interface FleetSummary {
  running: number;
  completed: number;
  failed: number;
  total: number;
  totalCost: number;
  tokensIn: number;
  tokensOut: number;
  concurrency: number;
  concurrencyMax: number;
  maxSpawns?: number | undefined;
  usedSpawns?: number | undefined;
  remainingSpawns?: number | undefined;
  budgetSource?: string | undefined;
  ceilingMismatch?: boolean | undefined;
  checkpointMaxSpawns?: number | undefined;
}

/** Shallow comparison for zustand selector equality checks.
 *  Compares own enumerable string-keyed properties by reference.
 *  Use with object selectors to avoid unnecessary re-renders:
 *    useFleetStore(selectFleetSummary, shallow)
 */
export function shallow<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/** Selector: derive fleet-wide summary from raw store state.
 *  Iterates the agents Map once to compute running/completed/failed
 *  counts and total cost, then reads scalar fields directly.
 */
export const selectFleetSummary = (state: FleetState): FleetSummary => {
  let running = 0;
  let completed = 0;
  let failed = 0;
  let totalCost = 0;
  for (const agent of state.agents.values()) {
    if (agent.status === 'running') running++;
    else if (agent.status === 'completed') completed++;
    else if (agent.status === 'failed' || agent.status === 'timeout') failed++;
    if (Number.isFinite(agent.costUsd) && agent.costUsd > 0) totalCost += agent.costUsd;
  }
  return {
    running,
    completed,
    failed,
    total: state.agents.size,
    totalCost,
    tokensIn: state.fleetTokensIn,
    tokensOut: state.fleetTokensOut,
    concurrency: state.fleetConcurrency,
    concurrencyMax: state.fleetConcurrencyMax,
    maxSpawns: state.fleetMaxSpawns,
    usedSpawns: state.fleetUsedSpawns,
    remainingSpawns: state.fleetRemainingSpawns,
    budgetSource: state.fleetBudgetSource,
    ceilingMismatch: state.fleetCeilingMismatch || undefined,
    checkpointMaxSpawns: state.fleetCheckpointMaxSpawns,
  };
};

/** Selector: return agents sorted leader-first → running-first → by start time.
 *  Creates a new array on every call; wrap with `useShallow` when subscribing
 *  through useFleetStore.
 *
 *  Leader-first ordering honors EVERY session's leader (`isLeader` flag),
 *  not the process-wide `leaderId` pointer: that pointer is last-writer-wins
 *  across four tabs, so sorting by it crowned only the most recently
 *  announced tab's leader and demoted the other three on every announce.
 */
export const selectSortedAgentList = (state: FleetState): SubagentView[] => {
  const arr = Array.from(state.agents.values());
  arr.sort((x, y) => {
    if (x === y || x.id === y.id) return 0;
    if (x.isLeader !== y.isLeader) return x.isLeader ? -1 : 1;
    return compareAgentsByActivity(x, y);
  });
  return arr;
};

/** Selector: O(1) lookup of the leader agent's name via the agents Map. */
export const selectLeaderName = (state: FleetState): string | undefined =>
  state.leaderId ? state.agents.get(state.leaderId)?.name : undefined;

// ── Per-session fleet accounting ───────────────────────────────────────────
//
// `leaderId` and `fleetTokensIn/Out` above are process-wide: one leader
// pointer and one running total for the whole roster. With four tabs open
// that is wrong in both directions — tab 1's crown lands on tab 3's card, and
// the Inspector shows the SUM of four sessions' subagent tokens as if it were
// this session's cost.
//
// The roster already knows better: every agent carries its own `sessionId`,
// `isLeader`, `tokensIn/Out`, status and cost. So rather than maintaining a
// second set of incremental counters per session — the existing global ones
// need three separate correction paths (removal, eviction, clear) precisely
// because incremental counters drift — the per-session view is DERIVED from
// the roster and cached against the `agents` Map identity. The Map is
// replaced on every applied event, so this recomputes at most once per event
// over a roster capped at 200, and it cannot disagree with what is displayed.

export interface SessionFleetTotals {
  /** The leader of THIS session, or undefined when it has none. */
  leaderId: string | undefined;
  tokensIn: number;
  tokensOut: number;
  totalCost: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

export const EMPTY_SESSION_TOTALS: SessionFleetTotals = Object.freeze({
  leaderId: undefined,
  tokensIn: 0,
  tokensOut: 0,
  totalCost: 0,
  running: 0,
  completed: 0,
  failed: 0,
  total: 0,
});

/**
 * Agents with no `sessionId` at all. They belong to no tab, so they are
 * counted once under this key rather than added to every tab's totals.
 */
export const UNATTRIBUTED = '\u0000unattributed';

export const totalsCache = new WeakMap<
  Map<string, SubagentView>,
  Map<string, SessionFleetTotals>
>();

export function totalsBySession(
  agents: Map<string, SubagentView>,
): Map<string, SessionFleetTotals> {
  const cached = totalsCache.get(agents);
  if (cached) return cached;
  const out = new Map<string, SessionFleetTotals>();
  for (const agent of agents.values()) {
    const key = agent.sessionId || UNATTRIBUTED;
    let bucket = out.get(key);
    if (!bucket) {
      bucket = { ...EMPTY_SESSION_TOTALS };
      out.set(key, bucket);
    }
    bucket.total++;
    if (agent.status === 'running') bucket.running++;
    else if (agent.status === 'completed') bucket.completed++;
    else if (agent.status === 'failed' || agent.status === 'timeout') bucket.failed++;
    if (Number.isFinite(agent.costUsd) && agent.costUsd > 0) bucket.totalCost += agent.costUsd;
    bucket.tokensIn += agent.tokensIn ?? 0;
    bucket.tokensOut += agent.tokensOut ?? 0;
    if (agent.isLeader) bucket.leaderId = agent.id;
  }
  totalsCache.set(agents, out);
  return out;
}

/** Fleet totals for ONE session. Never mutate the result — it is cached. */
export const selectSessionFleetTotals = (
  state: FleetState,
  sessionId: string | undefined,
): SessionFleetTotals => {
  if (!sessionId) return EMPTY_SESSION_TOTALS;
  return totalsBySession(state.agents).get(sessionId) ?? EMPTY_SESSION_TOTALS;
};

/**
 * The leader of ONE session.
 *
 * Falls back to the process-wide `leaderId` only when that agent actually
 * belongs to the session asked about — a leader that belongs to another tab
 * must never be reported here, which is exactly the crown-on-the-wrong-card
 * bug this replaces.
 */
export const selectSessionLeaderId = (
  state: FleetState,
  sessionId: string | undefined,
): string | undefined => {
  if (!sessionId) {
    if (!state.leaderId) return undefined;
    const globalAgent = state.agents.get(state.leaderId);
    return globalAgent && !globalAgent.sessionId ? state.leaderId : undefined;
  }
  const derived = totalsBySession(state.agents).get(sessionId)?.leaderId;
  if (derived) return derived;
  const global = state.leaderId;
  if (!global) return undefined;
  const agent = state.agents.get(global);
  return agent && agent.sessionId === sessionId ? global : undefined;
};

/**
 * Bid/option types and goal-state predicates for TaskAuctioneer. Split out
 * of task-auctioneer.ts.
 */
import type { FleetBus } from './fleet-bus.js';
import type { GoalNode, GoalStatus, KnowledgeGraph } from './knowledge-graph.js';
import type { Mailbox } from './mailbox-types.js';

// ── Task bid ─────────────────────────────────────────────────────────────

export interface TaskBid {
  id: string;
  taskId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  /** Dispatcher score for this task */
  score: number;
  /** Why this agent is a good fit */
  rationale: string;
  submittedAt: string;
}

// ── Auctioneer options ───────────────────────────────────────────────────

export interface TaskAuctionOptions {
  graph: KnowledgeGraph;
  fleet?: FleetBus | undefined;
  mailbox?: Mailbox | undefined;
  selfAgentId?: string | undefined;
  /** How long a bid window stays open before auto-awarding. Default: 30s */
  bidWindowMs?: number | undefined;
  /** Maximum concurrent tasks per agent. Default: 3 */
  maxTasksPerAgent?: number | undefined;
  /** Minimum confidence threshold for dispatcher scoring. Default: 0.3 */
  minConfidence?: number | undefined;
  /**
   * Maximum times a task can be republished when no bids are received.
   * After this, the task is marked as 'failed' with reason 'no_bids'.
   * Default: 3.
   */
  maxBidRetries?: number | undefined;
}

// ── TaskAuctioneer ──────────────────────────────────────────────────────

/**
 * A goal that has reached `done` or `failed` is finished for good — the same
 * two states `KnowledgeGraph._isTerminal` treats as terminal when it prunes.
 * `KnowledgeGraph.update` merges patches without consulting the current state,
 * so the absorbing rule has to be enforced by the caller that owns the
 * transition.
 */
export function isTerminalGoalStatus(status: GoalStatus): boolean {
  return status === 'done' || status === 'failed';
}

export function hasOpenBlockers(graph: KnowledgeGraph, blockedBy: readonly string[]): boolean {
  return blockedBy.some((id) => (graph.get(id) as GoalNode | undefined)?.status !== 'done');
}

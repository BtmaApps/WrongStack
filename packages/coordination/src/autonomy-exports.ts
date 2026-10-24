// ── Autonomous coordination layer ──────────────────────────────────────────

// ── Adaptive Concurrency Controller ──────────────────────────────────────────
export {
  AdaptiveConcurrencyController,
  type AdaptiveConcurrencyState,
} from './adaptive-concurrency.js';

/** Agent Monitor — virtual chat history, timeline streaming, HQ bridge */
export {
  type AgentMonitorOptions,
  AgentMonitorService,
  type AgentTimelineEntry,
  type AgentVirtualSession,
  createAgentMonitorService,
} from './agent-monitor.js';

export {
  AgentStatusTracker,
  type AgentStatusTrackerOptions,
} from './agent-status-tracker.js';

export type {
  ApprovalDecision,
  AutonomousBrainOptions,
  AutonomousDecisionRequest,
  AutonomousDecisionType,
  DecisionPrompt,
  EscalationDecision,
  LLMProvider,
  PrioritizationDecision,
  SpawnDecision,
} from './autonomous-brain.js';

/** Autonomous brain — LLM-backed decision-making engine */
export { AutonomousBrain } from './autonomous-brain.js';

export type {
  AutonomousCoordinatorOptions,
  CoordinatorEvent,
  CoordinatorStats,
  RunOptions,
} from './autonomous-coordinator.js';

/** Autonomous coordinator — wires all coordination components */
export { AutonomousCoordinator } from './autonomous-coordinator.js';

/** Change manager — autonomous code change lifecycle */
export {
  type ApplyResult,
  type ChangeFile,
  ChangeManager,
  type ChangeManagerOptions,
  type ChangeProposal,
  DEFAULT_QUALITY_CHECKS,
  type QualityGateChecks,
  type RollbackResult,
} from './change-manager.js';

export {
  type CollabBusState,
  CollaborationBus,
  type ConsumedInjectionInfo,
} from './collab-bus.js';

export {
  collabInjectMiddleware,
  collabPauseMiddleware,
} from './collab-pause.js';

export type {
  ConsensusOptions,
  ConsensusResult,
  QuorumRule,
  VoterConfig,
} from './consensus-protocol.js';

/** Consensus protocol — agent voting on proposed changes */
export { ConsensusProtocol } from './consensus-protocol.js';

export { FleetNotifier, type FleetNotifierOptions } from './fleet-notifier.js';

export {
  type KanbanDispatchPort,
  kanbanDispatch,
  setKanbanDispatch,
} from './kanban-dispatch-port.js';

export {
  type KanbanBoundaryOpsPort,
  kanbanBoundaryOps,
  setKanbanBoundaryOps,
} from './kanban-ops-port.js';

export type {
  ChangeNode,
  ChangeStatus,
  DecisionNode,
  FactCategory,
  FactNode,
  GoalNode,
  GoalPriority,
  GoalStatus,
  GraphSubscription,
  NodeFilter,
  NodeType,
  QualityCheck,
  QualityGateResult,
  VoteNode,
  VoteRecord,
  VoteValue,
} from './knowledge-graph.js';

/** Shared knowledge graph — facts, goals, decisions, changes */
export { KnowledgeGraph } from './knowledge-graph.js';

export type {
  TaskAuctionOptions,
  TaskBid,
} from './task-auctioneer.js';

/** Task auctioneer — project-wide task marketplace */
export { TaskAuctioneer } from './task-auctioneer.js';

export type {
  DAGEdgeEvent,
  DAGEdgeHandler,
  DAGNode,
  DAGNodeStatus,
  RunnablesHandler,
} from './task-dag.js';

/** Task DAG — dependency graph with fork/join semantics */
export { TaskDAG } from './task-dag.js';

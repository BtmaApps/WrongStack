// SDD domain: spec-driven development — parsing, task generation, tracking, flow,
// persistence, interactive building, visualization, and auto-execution.

// TaskTracker and DefaultTaskStore moved to @wrongstack/core/tasking in
// PR-10; re-exported here so existing `@wrongstack/sdd` consumers keep
// working. New code should import directly from `@wrongstack/core/tasking`.
export {
  DefaultTaskStore,
  type TaskStore,
  TaskTracker,
  type TaskTrackerChange,
  type TaskTrackerListener,
  type TaskTrackerOptions,
  type TaskTransition,
} from '@wrongstack/core/tasking';
// Auto-Executor
export {
  AutoExecutor,
  type AutoExecutorOptions,
  createAutoExecutor,
  type ExecutionSummary,
  type TaskExecutionContext,
  type TaskExecutionResult,
} from './auto-executor.js';
// Live board model + persistence
export {
  buildBoardSnapshot,
  buildBoardTasks,
  type SddBoardColumn,
  type SddBoardFeedEntry,
  type SddBoardSnapshot,
  type SddBoardStatus,
  type SddBoardTask,
  type SddDeadlockChain,
  type SddTaskDisplayStatus,
  shortIdMap,
} from './board-types.js';
export {
  type ConflictSide,
  hasConflictMarkers,
  type LlmConflictResolverOptions,
  makeLlmConflictResolver,
  makePreferSideConflictResolver,
  resolveConflictText,
} from './conflict-resolver.js';
// Critical Path
export {
  analyzeCriticalPath,
  type BottleneckTask,
  type CriticalPathAnalysis,
} from './critical-path.js';
export {
  makeLlmSubtaskGenerator,
  makePlanningDecomposer,
  type PlanningDecomposer,
  type PlanningDecomposerOptions,
  type SubtaskGeneratorOptions,
} from './decompose-task.js';
export { type SplitGraphNodeOptions, splitGraphNode } from './graph-split.js';
// Requirements Intake → spec-builder interview kickoff
export {
  type IntakeInterviewKickoff,
  intakeToInterviewKickoff,
  startInterviewFromIntake,
} from './intake-kickoff.js';
export { createKanbanSddSessionPersistence } from './kanban-sdd-session.js';
export {
  assessTaskNodeAtomicity,
  type DecompositionProposal,
  decomposeNonAtomicTasks,
  type PlanDecomposeOptions,
  type PlanDecomposeResult,
} from './plan-decompose.js';
// Project footprint for interview prompts (CLI + WebUI wizard share this)
export { gatherProjectContext } from './project-context.js';
export {
  assertSpecTaskGraphCoverage,
  assertTaskGraphExecutionIntegrity,
  assertTaskGraphRequirementCoverage,
  evaluateTaskGraphRequirementCoverage,
  type TaskGraphRequirementCoverage,
} from './requirement-coverage.js';
export {
  type SddBoardPersistence,
  SddBoardProjector,
  type SddBoardProjectorOptions,
} from './sdd-board-projector.js';
export {
  type SddBoardEvent,
  type SddBoardIndexEntry,
  SddBoardStore,
  type SddBoardStoreOptions,
} from './sdd-board-store.js';
export {
  isExplanatoryText,
  type SddIngestResult,
  SddInterviewDriver,
  type SddInterviewDriverOptions,
  type SddInterviewSnapshot,
} from './sdd-interview-driver.js';
export {
  applySddLifecycle,
  type CleanupStaleSddOptions,
  type CleanupStaleSddResult,
  cleanupSddWorktrees,
  cleanupStaleSddWorktrees,
  cleanupStaleWorktrees,
  type DestroySddProjectOptions,
  type DestroySddProjectResult,
  destroySddProject,
  type RollbackFromDiskOptions,
  rollbackSddRunFromDisk,
  type SddLifecycleOp,
  type SddLifecycleOptions,
  type SddLifecycleResult,
  sddRunLiveReason,
} from './sdd-lifecycle.js';
export {
  type RunResult,
  SddParallelRun,
  type SddParallelRunOptions,
  type SddProgress,
  type SddSubtaskSpec,
  type SddSupervisorVerdict,
  type WaveResult,
} from './sdd-parallel-run.js';
export { type SddRunControl, SddRunRegistry } from './sdd-run-registry.js';
export { SddSupervisor, type SddSupervisorOptions } from './sdd-supervisor.js';
// Parallel fan-out run (SDD TaskGraph → ParallelEternalEngine bridge)
export {
  SddTaskDecomposer,
  type SddTaskDecomposerOptions,
  type TaskBatch,
} from './sdd-task-decomposer.js';
// AI-Driven Interactive Builder
export {
  AISpecBuilder,
  type AISpecBuilderOptions,
  type AISpecPhase,
  type AISpecSession,
  type AISpecSessionPersistence,
  type CollectedAnswer,
  isAISpecSession,
} from './spec-builder.js';
export { SpecParser } from './spec-parser.js';
// Persistence
export { type SpecIndexEntry, SpecStore, type SpecStoreOptions } from './spec-store.js';
// Templates
export {
  getTemplate,
  listTemplates,
  SPEC_TEMPLATES,
  templateToMarkdown,
} from './spec-templates.js';
// Spec Versioning
export { type SpecDiff, type SpecVersion, SpecVersioning } from './spec-versioning.js';
export {
  type SddRunHandle,
  type StartSddRunOptions,
  startSddRun,
} from './start-sdd-run.js';
export {
  SpecDrivenDev,
  type SpecDrivenDevOptions,
  TaskFlow,
  type TaskFlowEventMap,
  type TaskFlowEventName,
  type TaskFlowExecutionContext,
  type TaskFlowOptions,
  type TaskFlowPhase,
} from './task-flow.js';
export {
  assessGeneratedTaskAtomicity,
  extractVerificationCommand,
  type GeneratedTask,
  TaskGenerator,
  type TaskGeneratorOptions,
} from './task-generator.js';
export {
  type TaskGraphIndexEntry,
  TaskGraphStore,
  type TaskGraphStoreOptions,
} from './task-graph-store.js';
// Visualization
export {
  renderProgress,
  renderSpecAnalysis,
  renderTaskGraph,
  renderTaskList,
} from './task-visualizer.js';
export {
  type AcceptanceCriteriaVerifierOptions,
  type CommandVerifierOptions,
  makeAcceptanceCriteriaVerifier,
  makeCommandVerifier,
  makeCompositeVerifier,
  type SddVerifyTask,
  tokenizeCommand,
} from './verify-task.js';

// VIBE Three-Stage Verification Protocol
export {
  auditVibeExecution,
  buildCoderContract,
  formatVibeReport,
  isIdentifierLikeExclusion,
  synthesizeVibeSpec,
  type VibeAuditCheck,
  type VibeAuditVerdict,
  type VibeCoderContract,
  type VibeScopeBoundaries,
  type VibeSpecSynthesizerResult,
  type VibeVerificationReport,
} from './vibe-protocol.js';
export { installVibeProtocol, VIBE_PROTOCOL_META_KEY } from './vibe-protocol-wiring.js';

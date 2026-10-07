import type {
  GovernanceCommand,
  GovernanceCommandDecision,
  GovernanceDecisionContext,
  GovernanceEvent,
  TaskAggregate,
} from './task-aggregate.js';
import type {
  ConsumeVerificationExecutionLeaseResult,
  IssueVerificationExecutionLeaseResult,
  VerificationExecutionBinding,
  VerificationExecutionLeaseCredential,
  VerificationExecutionLeaseStatus,
  VerificationLeaseIssuancePrecondition,
} from './verification-execution-lease.js';
import type { VerificationRunContract } from './verification-run-contract.js';
import type {
  RecordWorkspaceSnapshotResult,
  WorkspaceSnapshotFenceDescriptor,
} from './workspace-snapshot-fence.js';

export const GOVERNANCE_OBSERVATION_CATEGORIES = [
  'task_created',
  'status_changed',
  'plan_updated',
  'tool_invoked',
  'evidence_candidate',
  'verification_reported',
  'review_reported',
  'completion_claimed',
  'failure_reported',
  'capability_grant_issued',
  'capability_grant_revoked',
  'capability_grant_expired',
  'capability_grant_rotated',
  'daemon_attachment_broker_lifecycle',
  'daemon_shutdown_requested',
] as const;

export type GovernanceObservationCategory = (typeof GOVERNANCE_OBSERVATION_CATEGORIES)[number];

export const GOVERNANCE_OBSERVATION_DEFAULT_PAGE_SIZE = 50;
export const GOVERNANCE_OBSERVATION_MAX_PAGE_SIZE = 100;

export interface ReadGovernanceObservationsPageOptions {
  readonly projectId: string;
  readonly taskId?: string | undefined;
  /**
   * Exact set of categories to return. Callers pass the closed enum subset they
   * are entitled to rather than filtering after the fact, so the database never
   * hands back rows that are about to be discarded.
   */
  readonly categories: readonly GovernanceObservationCategory[];
  readonly afterSequence: number;
  readonly limit: number;
}

export interface GovernanceObservation {
  readonly observationId: string;
  readonly projectId: string;
  readonly taskId: string | null;
  readonly source: string;
  readonly category: GovernanceObservationCategory;
  readonly observedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface StoredGovernanceObservation extends GovernanceObservation {
  readonly sequence: number;
  readonly recordedAt: string;
}

export type AppendGovernanceObservationResult =
  | {
      readonly handled: true;
      readonly idempotentReplay: boolean;
      readonly observation: StoredGovernanceObservation;
    }
  | {
      readonly handled: false;
      readonly code: 'observation_id_conflict';
      readonly message: string;
    };

export interface GovernanceCommandReceipt {
  readonly commandId: string;
  readonly taskId: string;
  readonly command: GovernanceCommand;
  readonly decisionContext: GovernanceDecisionContext;
  readonly decision: GovernanceCommandDecision;
  readonly resultRevision: number;
  readonly recordedAt: string;
}

export type GovernanceCommandExecution =
  | {
      readonly handled: true;
      readonly idempotentReplay: boolean;
      readonly decision: GovernanceCommandDecision;
      readonly aggregate: TaskAggregate | null;
    }
  | {
      readonly handled: false;
      readonly code: 'command_id_conflict';
      readonly message: string;
    };

export interface GovernanceEventStore {
  execute(
    command: GovernanceCommand,
    context?: GovernanceDecisionContext,
  ): GovernanceCommandExecution;
  readTask(taskId: string): TaskAggregate | null;
  readEvents(taskId: string): readonly GovernanceEvent[];
  readReceipt(commandId: string): GovernanceCommandReceipt | null;
  appendObservation(observation: GovernanceObservation): AppendGovernanceObservationResult;
  readObservationsPage(
    options: ReadGovernanceObservationsPageOptions,
  ): readonly StoredGovernanceObservation[];
  readEvidenceCandidateObservations(
    projectId: string,
    taskId: string,
    options: { readonly afterSequence: number; readonly limit: number },
  ): readonly StoredGovernanceObservation[];
  recordWorkspaceSnapshot(projectId: string, manifestHash: string): RecordWorkspaceSnapshotResult;
  readLatestWorkspaceSnapshot(projectId: string): WorkspaceSnapshotFenceDescriptor | null;
  issueVerificationExecutionLease(
    run: VerificationRunContract,
  ): IssueVerificationExecutionLeaseResult;
  issueVerificationExecutionLeaseIfCurrent(
    run: VerificationRunContract,
    precondition: VerificationLeaseIssuancePrecondition,
  ): IssueVerificationExecutionLeaseResult;
  consumeVerificationExecutionLease(
    credential: VerificationExecutionLeaseCredential,
    binding: VerificationExecutionBinding,
  ): ConsumeVerificationExecutionLeaseResult;
  readVerificationExecutionLeaseStatus(leaseId: string): VerificationExecutionLeaseStatus;
  close(): void;
}

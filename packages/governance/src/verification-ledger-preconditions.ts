import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  evaluateGovernanceEvidenceCandidateObservation,
  type GovernanceEvidenceCandidateObservation,
} from './evidence-candidate.js';
import { calculatePlanVersionFingerprint } from './plan-version.js';
import { type GovernanceEvent, replayTaskEvents } from './task-aggregate.js';
import type { VerificationLeaseIssuancePrecondition } from './verification-execution-lease.js';
import type {
  GovernanceEventJsonRow,
  GovernanceEvidenceObservationRow,
  VerificationLeaseIssuanceFailure,
  WorkspaceSnapshotRow,
} from './verification-ledger-preconditions-contracts.js';
import type { VerificationRunContract } from './verification-run-contract.js';
import {
  isWorkspaceSnapshotFenceDescriptorValid,
  type WorkspaceSnapshotFenceDescriptor,
} from './workspace-snapshot-fence.js';
export interface VerificationLedgerPreconditionsHost {
  db: DatabaseSync;
  verifyWorkspaceSnapshotPrecondition(
    run: VerificationRunContract,
    precondition: VerificationLeaseIssuancePrecondition,
    projectId: string,
  ): VerificationLeaseIssuanceFailure | null;
  verifyCandidatePrecondition(
    run: VerificationRunContract,
    precondition: VerificationLeaseIssuancePrecondition,
    projectId: string,
  ): VerificationLeaseIssuanceFailure | null;
  readLatestWorkspaceSnapshotRow(projectId: string): WorkspaceSnapshotRow | undefined;
  workspaceSnapshotFromRow(row: WorkspaceSnapshotRow): WorkspaceSnapshotFenceDescriptor;
}

export function verifyIssuancePrecondition(
  host: VerificationLedgerPreconditionsHost,
  run: VerificationRunContract,
  precondition: VerificationLeaseIssuancePrecondition,
): VerificationLeaseIssuanceFailure | null {
  if (
    !Number.isSafeInteger(precondition.taskRevision) ||
    precondition.taskRevision < 1 ||
    !Number.isSafeInteger(precondition.activeContractVersion) ||
    precondition.activeContractVersion < 1 ||
    !Number.isSafeInteger(precondition.activePlanVersion) ||
    precondition.activePlanVersion < 1 ||
    !/^[a-f0-9]{64}$/u.test(precondition.activePlanFingerprint) ||
    !precondition.workspaceSnapshot ||
    !isWorkspaceSnapshotFenceDescriptorValid(precondition.workspaceSnapshot) ||
    !precondition.candidateObservation ||
    !Number.isSafeInteger(precondition.candidateObservation.sequence) ||
    precondition.candidateObservation.sequence < 1 ||
    typeof precondition.candidateObservation.observationId !== 'string' ||
    precondition.candidateObservation.observationId.trim().length === 0 ||
    precondition.candidateObservation.observationId.length > 512 ||
    (precondition.workflowState !== 'proposed_complete' &&
      precondition.workflowState !== 'verifying')
  ) {
    return {
      issued: false,
      code: 'canonical_state_mismatch',
      message: 'Verification issuance precondition is invalid.',
    };
  }
  if (
    !/^[a-f0-9]{64}$/.test(precondition.workspaceManifestHash) ||
    precondition.workspaceManifestHash !== run.workspaceManifestHash
  ) {
    return {
      issued: false,
      code: 'workspace_mismatch',
      message: 'Fresh workspace identity does not match the authorized verification run.',
    };
  }
  const rows = host.db
    .prepare(
      `SELECT task_id, revision, event_json FROM governance_events
         WHERE task_id = ? ORDER BY revision`,
    )
    .all(run.taskId) as unknown as GovernanceEventJsonRow[];
  if (rows.length === 0) {
    return {
      issued: false,
      code: 'canonical_task_missing',
      message: 'Canonical task state is absent during verification issuance.',
    };
  }
  let replayed: ReturnType<typeof replayTaskEvents>;
  try {
    const events = rows.map((row) => {
      const event = JSON.parse(row.event_json) as GovernanceEvent;
      if (event.taskId !== row.task_id || event.revision !== row.revision) {
        throw new Error('Canonical event columns do not match their payload.');
      }
      return event;
    });
    replayed = replayTaskEvents(events);
  } catch {
    return {
      issued: false,
      code: 'canonical_state_invalid',
      message: 'Canonical task events could not be reconstructed during verification issuance.',
    };
  }
  if (!replayed.replayed) {
    return {
      issued: false,
      code: 'canonical_state_invalid',
      message: 'Canonical task events failed deterministic replay during verification issuance.',
    };
  }
  const aggregate = replayed.aggregate;
  if (aggregate.taskId !== run.taskId) {
    return {
      issued: false,
      code: 'canonical_state_invalid',
      message: 'Canonical task identity is invalid during verification issuance.',
    };
  }
  const activePlan = aggregate.plans.find(
    (plan) => plan.planVersion === aggregate.activePlanVersion,
  );
  if (!activePlan) {
    return {
      issued: false,
      code: 'canonical_state_invalid',
      message: 'Canonical active plan is absent during verification issuance.',
    };
  }
  if (
    aggregate.revision !== precondition.taskRevision ||
    aggregate.activeContractVersion !== precondition.activeContractVersion ||
    aggregate.activePlanVersion !== precondition.activePlanVersion ||
    calculatePlanVersionFingerprint(activePlan) !== precondition.activePlanFingerprint ||
    aggregate.state !== precondition.workflowState ||
    run.contractVersion !== aggregate.activeContractVersion
  ) {
    return {
      issued: false,
      code: 'canonical_state_mismatch',
      message: 'Canonical task state changed before verification lease issuance.',
    };
  }
  const workspaceFailure = host.verifyWorkspaceSnapshotPrecondition(
    run,
    precondition,
    aggregate.projectId,
  );
  if (workspaceFailure) return workspaceFailure;
  return host.verifyCandidatePrecondition(run, precondition, aggregate.projectId);
}

export function verifyWorkspaceSnapshotPrecondition(
  host: VerificationLedgerPreconditionsHost,
  run: VerificationRunContract,
  precondition: VerificationLeaseIssuancePrecondition,
  projectId: string,
): VerificationLeaseIssuanceFailure | null {
  const row = host.readLatestWorkspaceSnapshotRow(projectId);
  if (!row) {
    return {
      issued: false,
      code: 'workspace_snapshot_missing',
      message: 'Canonical workspace snapshot is absent during verification issuance.',
    };
  }
  let latest: WorkspaceSnapshotFenceDescriptor;
  try {
    latest = host.workspaceSnapshotFromRow(row);
  } catch {
    return {
      issued: false,
      code: 'workspace_snapshot_invalid',
      message: 'Canonical workspace snapshot is invalid during verification issuance.',
    };
  }
  if (latest.projectId !== projectId || precondition.workspaceSnapshot.projectId !== projectId) {
    return {
      issued: false,
      code: 'workspace_mismatch',
      message: 'Canonical workspace snapshot does not match the governed project.',
    };
  }
  if (
    latest.revision !== precondition.workspaceSnapshot.revision ||
    latest.snapshotId !== precondition.workspaceSnapshot.snapshotId
  ) {
    return {
      issued: false,
      code: 'workspace_snapshot_stale',
      message: 'A newer canonical workspace snapshot exists during verification issuance.',
    };
  }
  if (
    latest.manifestHash !== run.workspaceManifestHash ||
    precondition.workspaceSnapshot.manifestHash !== run.workspaceManifestHash
  ) {
    return {
      issued: false,
      code: 'workspace_mismatch',
      message: 'Canonical workspace snapshot does not match the authorized verification run.',
    };
  }
  return null;
}

export function verifyCandidatePrecondition(
  host: VerificationLedgerPreconditionsHost,
  run: VerificationRunContract,
  precondition: VerificationLeaseIssuancePrecondition,
  projectId: string,
): VerificationLeaseIssuanceFailure | null {
  const row = host.db
    .prepare(
      `SELECT sequence, observation_id, project_id, task_id, source, category,
                observation_json, observation_hash, observed_at, recorded_at
         FROM governance_observations
         WHERE sequence = ?`,
    )
    .get(precondition.candidateObservation.sequence) as unknown as
    | GovernanceEvidenceObservationRow
    | undefined;
  if (!row) {
    return {
      issued: false,
      code: 'canonical_candidate_missing',
      message: 'Selected evidence candidate is absent during verification issuance.',
    };
  }
  let observation: GovernanceEvidenceCandidateObservation;
  try {
    const payload = JSON.parse(row.observation_json) as Record<string, unknown>;
    if (
      createHash('sha256').update(row.observation_json, 'utf8').digest('hex') !==
        row.observation_hash ||
      payload['observationId'] !== row.observation_id ||
      payload['projectId'] !== row.project_id ||
      payload['taskId'] !== row.task_id ||
      payload['source'] !== row.source ||
      payload['category'] !== row.category ||
      payload['observedAt'] !== row.observed_at ||
      !payload['payload'] ||
      typeof payload['payload'] !== 'object' ||
      Array.isArray(payload['payload'])
    ) {
      throw new Error('Canonical candidate columns do not match their payload.');
    }
    observation = {
      sequence: row.sequence,
      observationId: row.observation_id,
      source: row.source,
      taskId: row.task_id,
      category: row.category,
      observedAt: row.observed_at,
      recordedAt: row.recorded_at,
      payload: payload['payload'] as Readonly<Record<string, unknown>>,
    };
  } catch {
    return {
      issued: false,
      code: 'canonical_candidate_invalid',
      message: 'Selected evidence candidate could not be reconstructed during issuance.',
    };
  }
  const candidate = evaluateGovernanceEvidenceCandidateObservation(observation);
  if (candidate.evaluation.state !== 'eligible_for_evaluation') {
    return {
      issued: false,
      code: 'canonical_candidate_invalid',
      message: 'Selected evidence candidate is not eligible for verification.',
    };
  }
  if (
    row.project_id !== projectId ||
    row.category !== 'evidence_candidate' ||
    candidate.sequence !== precondition.candidateObservation.sequence ||
    candidate.observationId !== precondition.candidateObservation.observationId ||
    candidate.taskId !== run.taskId ||
    candidate.candidateId !== run.candidateId ||
    candidate.source !== run.candidateSource ||
    candidate.planFingerprint !== run.planFingerprint ||
    candidate.workspaceManifestHash !== run.workspaceManifestHash
  ) {
    return {
      issued: false,
      code: 'canonical_candidate_mismatch',
      message: 'Selected evidence candidate does not match the authorized verification run.',
    };
  }
  return null;
}

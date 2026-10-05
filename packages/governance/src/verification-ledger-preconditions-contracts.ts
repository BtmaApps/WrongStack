import type { IssueVerificationExecutionLeaseResult } from './verification-execution-lease.js';

export interface GovernanceEventJsonRow {
  task_id: string;
  revision: number;
  event_json: string;
}

export interface GovernanceEvidenceObservationRow {
  sequence: number;
  observation_id: string;
  project_id: string;
  task_id: string | null;
  source: string;
  category: string;
  observation_json: string;
  observation_hash: string;
  observed_at: string;
  recorded_at: string;
}

export interface WorkspaceSnapshotRow {
  snapshot_id: string;
  project_id: string;
  revision: number;
  manifest_hash: string;
  captured_at: string;
}

export type VerificationLeaseIssuanceFailure = Extract<
  IssueVerificationExecutionLeaseResult,
  { issued: false }
>;

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

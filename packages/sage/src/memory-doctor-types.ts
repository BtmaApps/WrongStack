/**
 * SAGE Doctor contract: a read-mostly health report over the store plus a
 * closed set of named, idempotent repairs. Every repair is conservative —
 * it never hard-deletes a memory, it only removes graph noise, lifts a
 * runtime-mode audience, rebuilds the FTS index or runs ordinary hygiene.
 */
import type { SageHygieneOptions, SageHygieneReport } from './memory-hygiene-types.js';

export type SageDoctorSeverity = 'ok' | 'info' | 'warn' | 'error';

/** Repairs `doctor({ fix })` can apply. Each is safe to run repeatedly. */
export type SageDoctorFixId =
  /** Run a full hygiene pass now (expired GC, verification, review candidates). */
  | 'hygiene'
  /** Remove `same_topic` / `related_to` edges touching a hub node. */
  | 'graph-hubs'
  /** Remove edges whose memory endpoint is missing or deleted. */
  | 'dangling-edges'
  /** Strip the inherited runtime mode `default` from memory audiences. */
  | 'audience-runtime-mode'
  /** Rebuild the FTS5 index from the memories table. */
  | 'fts-rebuild';

export const SAGE_DOCTOR_FIX_IDS: readonly SageDoctorFixId[] = [
  'hygiene',
  'graph-hubs',
  'dangling-edges',
  'audience-runtime-mode',
  'fts-rebuild',
];

export interface SageDoctorCheck {
  /** Stable id (`expired-active`, `graph-hubs`, …) for UIs and tests. */
  id: string;
  title: string;
  severity: SageDoctorSeverity;
  /** One-line human summary of what was measured. */
  summary: string;
  count?: number | undefined;
  /** Repair that resolves this check, when one exists. */
  fix?: SageDoctorFixId | undefined;
  /** A few concrete ids / nodes, so the finding can be inspected. */
  samples?: string[] | undefined;
}

export interface SageDoctorMetrics {
  total: number;
  active: number;
  byStatus: Record<string, number>;
  edges: number;
  pendingCandidates: number;
  /** Totals over active memories. */
  injections: number;
  uses: number;
  /** uses / injections, 0 when nothing was injected. */
  precision: number;
  /** Active, non-audience memories injected ≥ 20 times and never used. */
  injectedNeverUsed: number;
  unanchoredActive: number;
  neverVerifiedActive: number;
  dbBytes?: number | undefined;
  walBytes?: number | undefined;
}

/** Daemon-owned maintenance scheduler state (see project-server-hygiene.ts). */
export interface SageMaintenanceStatus {
  owner: 'daemon' | 'inline';
  /** Whether a host registered hygiene options with the scheduler. */
  scheduled: boolean;
  intervalMs: number;
  running: boolean;
  lastRunAt?: string | undefined;
  lastDurationMs?: number | undefined;
  lastError?: string | undefined;
  lastReport?: SageHygieneReport | undefined;
  nextRunAt?: string | undefined;
}

export interface SageDoctorFixResult {
  fix: SageDoctorFixId;
  changed: number;
  detail: string;
}

export interface SageDoctorReport {
  generatedAt: string;
  metrics: SageDoctorMetrics;
  checks: SageDoctorCheck[];
  maintenance?: SageMaintenanceStatus | undefined;
  fixesApplied?: SageDoctorFixResult[] | undefined;
}

export interface SageDoctorOptions {
  /** Repairs to apply before the report is measured. */
  fix?: SageDoctorFixId[] | undefined;
  /** Options for the `hygiene` repair; the host's configured hygiene options. */
  hygieneOptions?: SageHygieneOptions | undefined;
}

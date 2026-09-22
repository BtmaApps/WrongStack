import type { DatabaseSync } from 'node:sqlite';

export interface VerificationLedgerSchemaHost {
  db: DatabaseSync;
}
export function initializeSchema(host: VerificationLedgerSchemaHost): void {
  host.db.exec(`
      CREATE TABLE IF NOT EXISTS governance_verification_runs (
        run_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        verifier_client_id TEXT NOT NULL,
        contract_json TEXT NOT NULL,
        contract_hash TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS governance_verification_leases (
        lease_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE REFERENCES governance_verification_runs(run_id),
        task_id TEXT NOT NULL,
        verifier_client_id TEXT NOT NULL,
        verifier_hash TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS governance_verification_lease_consumptions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        lease_id TEXT NOT NULL UNIQUE REFERENCES governance_verification_leases(lease_id),
        run_id TEXT NOT NULL,
        verifier_client_id TEXT NOT NULL,
        binding_hash TEXT NOT NULL,
        consumed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS governance_workspace_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        manifest_hash TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        UNIQUE (project_id, revision)
      );

      CREATE INDEX IF NOT EXISTS governance_verification_runs_task_idx
        ON governance_verification_runs (task_id, recorded_at);

      CREATE INDEX IF NOT EXISTS governance_workspace_snapshots_project_idx
        ON governance_workspace_snapshots (project_id, revision);

      CREATE TRIGGER IF NOT EXISTS governance_verification_runs_no_update
      BEFORE UPDATE ON governance_verification_runs
      BEGIN
        SELECT RAISE(ABORT, 'governance_verification_runs is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_verification_runs_no_delete
      BEFORE DELETE ON governance_verification_runs
      BEGIN
        SELECT RAISE(ABORT, 'governance_verification_runs is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_verification_leases_no_update
      BEFORE UPDATE ON governance_verification_leases
      BEGIN
        SELECT RAISE(ABORT, 'governance_verification_leases is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_verification_leases_no_delete
      BEFORE DELETE ON governance_verification_leases
      BEGIN
        SELECT RAISE(ABORT, 'governance_verification_leases is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_verification_consumptions_no_update
      BEFORE UPDATE ON governance_verification_lease_consumptions
      BEGIN
        SELECT RAISE(ABORT, 'governance_verification_lease_consumptions is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_verification_consumptions_no_delete
      BEFORE DELETE ON governance_verification_lease_consumptions
      BEGIN
        SELECT RAISE(ABORT, 'governance_verification_lease_consumptions is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_workspace_snapshots_no_update
      BEFORE UPDATE ON governance_workspace_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'governance_workspace_snapshots is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS governance_workspace_snapshots_no_delete
      BEFORE DELETE ON governance_workspace_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'governance_workspace_snapshots is append-only');
      END;
    `);
}

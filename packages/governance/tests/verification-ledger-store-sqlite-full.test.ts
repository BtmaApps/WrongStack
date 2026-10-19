import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SqliteVerificationLedger } from '../src/index.js';

/**
 * Behavioural counterpart to the static detector in
 * `verification-ledger-rollback-mask.test.ts`.
 *
 * That static test proves each catch-block ROLLBACK is wrapped in try/catch,
 * but it reads the source as TEXT: it would still pass if the catch block
 * swallowed the primary error instead of rethrowing it. These cases force a real
 * write failure and assert the caller still receives the ORIGINAL database
 * error, which is the contract the wrapping exists to protect.
 *
 * The databases are in-memory on purpose: temp-dir removal on Windows hits
 * EBUSY while SQLite still holds the file, which masks the assertion under test.
 */
describe('SqliteVerificationLedger recordWorkspaceSnapshot contracts', () => {
  function openLedger() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA page_size = 512');
    const ledger = new SqliteVerificationLedger(db, {
      now: () => '2026-08-02T12:01:00.000Z',
      verificationLeaseSecret: () => 's'.repeat(43),
    });
    ledger.initializeSchema();
    return { db, ledger };
  }

  it('rethrows the original write error rather than a secondary ROLLBACK failure', () => {
    const { db, ledger } = openLedger();
    try {
      const pages = Number(
        (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count,
      );
      // Freeze growth at the current size: the next page allocation must fail.
      db.exec(`PRAGMA max_page_count = ${pages}`);

      const manifestHash = 'b'.repeat(64);
      let thrown: unknown;
      try {
        ledger.recordWorkspaceSnapshot('p'.repeat(512), manifestHash);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = String((thrown as Error).message);
      expect(message).toMatch(/full|space/i);
      expect(message).not.toMatch(/cannot rollback/i);
    } finally {
      db.close();
    }
  });

  it('records successfully when growth is not constrained (control)', () => {
    const { db, ledger } = openLedger();
    try {
      expect(ledger.recordWorkspaceSnapshot('project-1', 'b'.repeat(64))).toMatchObject({
        recorded: true,
      });
    } finally {
      db.close();
    }
  });

  it('freezes the result it returns, including the snapshot descriptor', () => {
    const { db, ledger } = openLedger();
    try {
      const result = ledger.recordWorkspaceSnapshot('project-1', 'b'.repeat(64));
      expect(Object.isFrozen(result)).toBe(true);
      if (!result.recorded) return;
      expect(Object.isFrozen(result.snapshot)).toBe(true);
    } finally {
      db.close();
    }
  });
});

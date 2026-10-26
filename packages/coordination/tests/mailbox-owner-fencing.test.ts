/**
 * Regression tests for the DB-level mailbox ownership fence.
 *
 * H3: the IPC endpoint election only arbitrates between processes that speak
 * the same protocol version (the version is embedded in the endpoint path),
 * so during a rolling release an old daemon and a new daemon can both hold
 * their own endpoint over the SAME `_mailbox.sqlite`. The fence is the
 * database-level guard: the owner records itself in `mailbox_meta`, refreshes
 * a heartbeat, and a live owner on another endpoint refuses to be joined.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadRuntimeDatabaseSync } from '@wrongstack/persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  importDaemonInstance,
  removeProjectFixtureDirectory,
} from '../../core/tests/helpers/project-server-harness.js';
import { SqliteMailbox } from '../src/sqlite-mailbox.js';
import {
  assertMailboxOwnershipAvailable,
  claimMailboxOwnership,
  inspectMailboxOwner,
  MAILBOX_OWNER_META_KEY,
  MAILBOX_OWNER_STALE_MS,
  MailboxOwnershipConflictError,
  refreshMailboxOwnership,
} from '../src/sqlite-mailbox-owner.js';

const DatabaseSync = loadRuntimeDatabaseSync();

/** SQLite keeps `-wal`/`-shm` mapped for a moment after close. */
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 } as const;

const OUR_ENDPOINT = 'wsmb-v9/ours.sock';
const FOREIGN_ENDPOINT = 'wsmb-v3/foreign.sock';

let dir: string;
const stores: SqliteMailbox[] = [];

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mailbox-owner-fence-'));
});

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close().catch(() => undefined);
  await removeProjectFixtureDirectory(dir, RM_OPTIONS);
});

/** The owner fence row, as the daemon writes it. */
interface SeededOwner {
  endpoint: string;
  pid: number;
  protocolVersion: number;
  heartbeatAt: string;
}

/** Write an owner fence row into a database file. */
function seedOwner(databasePath: string, owner: SeededOwner): void {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS mailbox_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.prepare(
      'INSERT INTO mailbox_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(MAILBOX_OWNER_META_KEY, JSON.stringify(owner));
  } finally {
    db.close();
  }
}

function databasePath(): string {
  return path.join(dir, '_mailbox.sqlite');
}

function ownerRow(): SeededOwner | null {
  return inspectMailboxOwner(databasePath());
}

describe('mailbox DB-level ownership fence', () => {
  it('refuses to open a database held by a live foreign owner', () => {
    seedOwner(databasePath(), {
      endpoint: FOREIGN_ENDPOINT,
      pid: 4242,
      protocolVersion: 3,
      heartbeatAt: new Date().toISOString(),
    });

    expect(() => assertMailboxOwnershipAvailable(databasePath(), OUR_ENDPOINT)).toThrow(
      MailboxOwnershipConflictError,
    );
  });

  it('reclaims a database whose owner heartbeat expired', () => {
    seedOwner(databasePath(), {
      endpoint: FOREIGN_ENDPOINT,
      pid: 4242,
      protocolVersion: 3,
      heartbeatAt: new Date(Date.now() - MAILBOX_OWNER_STALE_MS - 1_000).toISOString(),
    });

    expect(() => assertMailboxOwnershipAvailable(databasePath(), OUR_ENDPOINT)).not.toThrow();

    const store = new SqliteMailbox(dir);
    stores.push(store);
    store.claimOwnership({
      endpoint: OUR_ENDPOINT,
      pid: process.pid,
      protocolVersion: 9,
    });

    expect(ownerRow()?.endpoint).toBe(OUR_ENDPOINT);
  });

  it('treats the same endpoint as its own owner', () => {
    seedOwner(databasePath(), {
      endpoint: OUR_ENDPOINT,
      pid: 4242,
      protocolVersion: 9,
      heartbeatAt: new Date().toISOString(),
    });

    expect(() => assertMailboxOwnershipAvailable(databasePath(), OUR_ENDPOINT)).not.toThrow();
  });

  it('refuses a claim while a live foreign owner holds the database', () => {
    const store = new SqliteMailbox(dir);
    stores.push(store);
    seedOwner(databasePath(), {
      endpoint: FOREIGN_ENDPOINT,
      pid: 4242,
      protocolVersion: 3,
      heartbeatAt: new Date().toISOString(),
    });

    expect(() =>
      store.claimOwnership({ endpoint: OUR_ENDPOINT, pid: process.pid, protocolVersion: 9 }),
    ).toThrow(MailboxOwnershipConflictError);
    // The foreign row is untouched.
    expect(ownerRow()?.endpoint).toBe(FOREIGN_ENDPOINT);
  });

  it('does not overwrite the row of an owner that took over', () => {
    const store = new SqliteMailbox(dir);
    stores.push(store);
    store.claimOwnership({ endpoint: OUR_ENDPOINT, pid: process.pid, protocolVersion: 9 });
    seedOwner(databasePath(), {
      endpoint: FOREIGN_ENDPOINT,
      pid: 4242,
      protocolVersion: 3,
      heartbeatAt: new Date().toISOString(),
    });

    expect(
      store.refreshOwnership({ endpoint: OUR_ENDPOINT, pid: process.pid, protocolVersion: 9 }),
    ).toBe(false);
    expect(ownerRow()?.endpoint).toBe(FOREIGN_ENDPOINT);
  });

  it('releases only its own owner row', () => {
    const store = new SqliteMailbox(dir);
    stores.push(store);
    store.claimOwnership({ endpoint: OUR_ENDPOINT, pid: process.pid, protocolVersion: 9 });
    expect(ownerRow()?.endpoint).toBe(OUR_ENDPOINT);

    // A release from a foreign endpoint must not clear the owner's row.
    store.releaseOwnership(FOREIGN_ENDPOINT);
    expect(ownerRow()?.endpoint).toBe(OUR_ENDPOINT);

    store.releaseOwnership(OUR_ENDPOINT);
    expect(ownerRow()).toBeNull();
  });

  it('writes and refreshes the owner row through the module API', () => {
    const db = new DatabaseSync(databasePath());
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS mailbox_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      const ownerStore = {
        db,
        transaction: <T>(run: () => T): T => run(),
      };

      const claimed = claimMailboxOwnership(ownerStore, {
        endpoint: OUR_ENDPOINT,
        pid: process.pid,
        protocolVersion: 9,
      });
      expect(claimed.endpoint).toBe(OUR_ENDPOINT);
      expect(claimed.heartbeatAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      expect(
        refreshMailboxOwnership(ownerStore, {
          endpoint: OUR_ENDPOINT,
          pid: process.pid,
          protocolVersion: 9,
        }),
      ).toBe(true);
      expect(ownerRow()?.endpoint).toBe(OUR_ENDPOINT);
    } finally {
      db.close();
    }
  });
});

describe('mailbox project server ownership refusal', () => {
  it('refuses to serve a database a live foreign owner holds', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mailbox-owner-refusal-'));
    seedOwner(path.join(root, '_mailbox.sqlite'), {
      endpoint: FOREIGN_ENDPOINT,
      pid: 4242,
      protocolVersion: 3,
      heartbeatAt: new Date().toISOString(),
    });

    const captured: string[] = [];
    const originalWrite = process.stderr.write;
    const previousExitCode = process.exitCode;
    process.stderr.write = (chunk: unknown): boolean => {
      captured.push(String(chunk));
      return true;
    };
    try {
      await importDaemonInstance(
        '../../../coordination/src/mailbox-project-server.ts',
        ['--project-dir', root],
        1,
      );
      await vi.waitFor(
        () => {
          expect(captured.join('')).toContain('refused to start');
        },
        { timeout: 20_000, interval: 50 },
      );
    } finally {
      process.stderr.write = originalWrite;
      process.exitCode = previousExitCode;
      await removeProjectFixtureDirectory(root, RM_OPTIONS);
    }

    expect(captured.join('')).toContain('owned by a live owner');
  });
});

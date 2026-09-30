/**
 * Regression: a ChronicleSqliteJournal CONSTRUCTOR failure must not poison the
 * memoized store() promise.
 *
 * The constructor opens the SQLite handle and switches it to WAL (and runs
 * ensureIncrementalVacuum) BEFORE the first step that can fail on a real
 * machine — ensureChronicleSchema, the quota manager, or the startup count.
 * A corrupt file, a read-only directory, or a full disk throws right there.
 *
 * Both memoized store() sites (chronicle/project-server.ts and
 * chronicle/project-access.ts) used to construct the journal OUTSIDE the try,
 * so such a throw escaped every catch: the rejected promise stayed memoized
 * for the lifetime of the access object (every later call re-awaited the same
 * rejection) AND the already-open handle leaked with its write-ahead log. The
 * import-failure path reset the memo correctly, which is exactly why the bug
 * survived — the tests only ever faulted the import, never the constructor.
 *
 * The fault is injected at ensureChronicleSchema, the real production fault
 * point, and the test asserts the RECOVERY contract: after the fault clears, a
 * later call must re-attempt the open instead of replaying the memoized
 * rejection.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChronicleProjectAccess } from '../../src/chronicle/project-access.js';

// Arm/disarm the injected fault. vi.hoisted so the (hoisted) mock factory below
// can close over it. Starts disarmed so the control opens normally.
const schemaFault = vi.hoisted(() => ({ on: false }));

// The real module (so loadDatabaseSync still returns the genuine DatabaseSync
// and the handle really opens), with only the schema step made faultable.
vi.mock('../../src/chronicle/sqlite-journal-schema.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/chronicle/sqlite-journal-schema.js')>();
  return {
    ...actual,
    ensureChronicleSchema: (db: unknown): void => {
      if (schemaFault.on) throw new Error('schema fault: simulated corrupt chronicle database');
      actual.ensureChronicleSchema(db as never);
    },
  };
});

const event = {
  eventType: 'tool.started',
  scope: { installationId: 'i', machineId: 'm' },
  correlation: { traceId: 't', spanId: 's' },
};

describe('chronicle store() — constructor failure does not poison the memo', () => {
  let root: string;

  beforeEach(async () => {
    schemaFault.on = false;
    vi.stubEnv('WRONGSTACK_CHRONICLE_INLINE', '1');
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'chronicle-ctor-fault-'));
  });

  afterEach(async () => {
    schemaFault.on = false;
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  });

  function accessFor() {
    return createChronicleProjectAccess({
      projectRoot: path.join(root, 'project'),
      projectPaths: {
        globalRoot: root,
        projectId: 'proj',
        projectDir: path.join(root, 'projectDir'),
        workspaceId: 'ws',
      },
    });
  }

  // Control: with no fault the store opens and appends normally. Guards against
  // a harness that "passes" the recovery assertion simply because append never
  // works.
  it('control: opens and appends with no constructor fault', async () => {
    const access = accessFor();
    const result = await access.call('append', { inputs: [event] });
    // append returns the stored event rows (ChronicleEvent[]).
    expect(result).toHaveLength(1);
    await access.close();
  });

  // The regression: a constructor failure must reject the call AND clear the
  // memo, so the next call re-attempts instead of replaying the rejection.
  it('retries the open after a constructor failure instead of replaying the memoized rejection', async () => {
    const access = accessFor();

    schemaFault.on = true;
    // Constructor throws inside store() -> this append rejects.
    await expect(access.call('append', { inputs: [event] })).rejects.toThrow(/schema fault/u);

    // Fault clears. Without the fix the memoized rejected promise is still in
    // place and this call rejects with the SAME error forever; with the fix the
    // memo was reset and a fresh open succeeds.
    schemaFault.on = false;
    const result = await access.call('append', { inputs: [event] });
    expect(result).toHaveLength(1);

    await access.close();
  });
});

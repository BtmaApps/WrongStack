/**
 * The maintenance health check must never report a healthy pass for a
 * maintenance state it cannot read.
 *
 * `maintenanceDoctorCheck` exists to catch the silent failure this
 * repository already suffered from: "a pass that never ran, failed last
 * time, or is far past its interval is exactly the silent failure that left
 * expired memories active for weeks".
 *
 * The persisted state file is read with a `catch` that only covers invalid
 * JSON, so a file that parses but carries a garbage timestamp reached the
 * check verbatim - and `Date.parse` of it is NaN, so every age comparison
 * was false and the check fell through to "ok".
 *
 * See: packages/sage/src/project-server-hygiene.ts
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SageHygieneReport } from '../src/memory-hygiene-types.js';
import { createHygieneRunner, maintenanceDoctorCheck } from '../src/project-server-hygiene.js';
import type { CompleteSageStore } from '../src/project-server-options.js';

const REPORT = {
  startedAt: '2026-10-19T00:00:00.000Z',
  completedAt: '2026-10-19T00:00:01.000Z',
  examined: 10,
  deleted: 2,
  staled: 1,
  reviewCandidatesCreated: 0,
  superseded: 0,
} as unknown as SageHygieneReport;

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const INTERVAL_MS = 3_600_000;

let directory: string;
let statePath: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-maint-state-'));
  statePath = path.join(directory, 'hygiene', 'maintenance.json');
  await fs.mkdir(path.dirname(statePath), { recursive: true });
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

function fakeStore() {
  const hygiene = async () => REPORT;
  return { store: { hygiene } as unknown as CompleteSageStore };
}

/** Write a persisted maintenance state file and read the runner's status. */
async function statusFor(state: Record<string, unknown>) {
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const runner = createHygieneRunner(fakeStore().store, {
    statePath,
    settleMs: 90_000,
    intervalMs: 6 * 60 * 60_000,
  });
  const status = runner.status();
  runner.dispose();
  return status;
}

describe('maintenance state the runtime cannot read', () => {
  it('reports an unreadable lastRunAt as a problem, not as a healthy pass', async () => {
    const status = await statusFor({ lastRunAt: 'not-a-timestamp' });

    const check = maintenanceDoctorCheck(status, NOW);
    expect(check.severity).not.toBe('ok');
    // The state no longer carries the unreadable stamp at all.
    expect(status.lastRunAt).toBeUndefined();
  });

  it('reports a lastRunAt that is not a timestamp string as a problem', async () => {
    const status = await statusFor({ lastRunAt: 17_500 });

    expect(maintenanceDoctorCheck(status, NOW).severity).not.toBe('ok');
  });

  it('still reports a readable, overdue pass as a problem', async () => {
    const status = await statusFor({ lastRunAt: '2026-10-18T00:00:00.000Z' });

    expect(maintenanceDoctorCheck(status, NOW).severity).toBe('warn');
  });

  it('keeps the overdue threshold exact', () => {
    const base = {
      owner: 'daemon' as const,
      scheduled: true,
      intervalMs: INTERVAL_MS,
      running: false,
    };
    // Exactly at the threshold is not overdue.
    expect(
      maintenanceDoctorCheck(
        { ...base, lastRunAt: new Date(NOW - INTERVAL_MS * 4).toISOString() },
        NOW,
      ).severity,
    ).toBe('ok');
    // One millisecond past it is.
    expect(
      maintenanceDoctorCheck(
        { ...base, lastRunAt: new Date(NOW - INTERVAL_MS * 4 - 1).toISOString() },
        NOW,
      ).severity,
    ).toBe('warn');
  });
});

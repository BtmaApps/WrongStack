/**
 * TechStack — job progress retention (real in-memory store).
 *
 * `updateJobStatus(id, status, progress?)` must not discard progress it is not
 * asked to replace: `TechStackEngine.analyze`'s terminal path updates the job
 * with no progress (`failed` / `cancelled`), and the earlier `progress_json = ?`
 * binding wrote NULL there, erasing the phase and counters the job had been
 * reporting. The sibling `completed_at` column in the same statement already
 * used COALESCE for exactly this reason.
 *
 * Unlike tests/store/sqlite.test.ts (which mocks node:sqlite and can only assert
 * the arguments handed to `run`), this suite drives a REAL store so the
 * round-trip through `getJob` / `listJobs` is what gets asserted.
 *
 * @see packages/techstack/src/store/sqlite.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TechStackStore } from '../../src/store/sqlite.js';
import type { TechStackJob, TechStackJobProgress } from '../../src/types.js';

const JOB_ID = 'job-progress-1';
const MID_RUN: TechStackJobProgress = { phase: 'inventorying', completed: 3, total: 10 };

let store: TechStackStore;

function seedJob(): void {
  const job: TechStackJob = {
    id: JOB_ID,
    projectId: 'proj-1',
    targetRoot: '/tmp/project',
    kind: 'analyze',
    status: 'queued',
    fingerprint: '',
    requestedBy: 'system',
    createdAt: new Date().toISOString(),
    progress: { phase: 'queued', completed: 0, total: 0 },
  };
  store.saveJob(job);
  store.updateJobStatus(JOB_ID, 'inventorying', MID_RUN);
}

beforeEach(() => {
  store = new TechStackStore({ projectSlug: 'job-progress', dbPath: ':memory:' });
  seedJob();
});

afterEach(() => {
  store.close();
});

function progress(): TechStackJobProgress | undefined {
  return store.getJob(JOB_ID)?.progress;
}

describe('TechStackStore job progress retention', () => {
  it('stores progress when the update carries it', () => {
    expect(progress()).toEqual(MID_RUN);
  });

  it('keeps the last known progress on the failure transition', () => {
    // TechStackEngine.analyze catch: updateJob('failed') — no progress argument.
    store.updateJobStatus(JOB_ID, 'failed');

    expect(store.getJob(JOB_ID)?.status).toBe('failed');
    expect(progress()).toEqual(MID_RUN);
  });

  it('keeps the last known progress on the cancellation transition', () => {
    store.updateJobStatus(JOB_ID, 'cancelled');

    expect(progress()).toEqual(MID_RUN);
    // The list path the UI reads must agree with the by-id path.
    expect(store.listJobs('proj-1')[0]?.progress).toEqual(MID_RUN);
  });

  it('never clears completed_at on a progress-less update', () => {
    store.updateJobStatus(JOB_ID, 'completed', { phase: 'completed', completed: 1, total: 1 });
    const completedAt = store.getJob(JOB_ID)?.completedAt;
    expect(completedAt).toBeDefined();

    // A non-terminal update passes no completion time, so COALESCE keeps the
    // stored one. (A terminal update re-stamps it by design, so asserting
    // "unchanged" across two terminal updates only passed by landing in the
    // same millisecond — a timing-dependent assertion.)
    store.updateJobStatus(JOB_ID, 'inventorying');

    expect(store.getJob(JOB_ID)?.completedAt).toBe(completedAt);
    expect(progress()).toEqual({ phase: 'completed', completed: 1, total: 1 });
  });
});

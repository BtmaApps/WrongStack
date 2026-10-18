import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationStore } from '../src/automation/store.js';
import type { AutomationJobSpec } from '../src/automation/types.js';

describe('AutomationStore re-enable schedule recomputation', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0, dirs.length)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recomputes stale nextRunAt from now when enabling a previously disabled job via setEnabled or update', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auto-reenable-'));
    dirs.push(tempDir);

    const store = new AutomationStore(tempDir);
    const baseSpec: AutomationJobSpec = {
      name: 'interval-job',
      projectRoot: tempDir,
      image: 'wrongstack:latest',
      prompt: 'check health',
      envNames: [],
      yolo: false,
      timeoutMs: 60_000,
      enabled: false,
      intervalMs: 60_000,
    };

    const created = await store.add(baseSpec, 1_000_000);
    expect(created.nextRunAt).toBe(1_060_000);

    await store.setEnabled(created.id, true, created.revision, undefined, 1_300_000);
    await store.scheduleDue(1_300_000);
    const snapImmediate = await store.snapshot();
    expect(snapImmediate.runs.filter((r) => r.jobId === created.id)).toHaveLength(0);

    await store.scheduleDue(1_360_000);
    const snapNextTick = await store.snapshot();
    expect(snapNextTick.runs.filter((r) => r.jobId === created.id)).toHaveLength(1);

    const spec2: AutomationJobSpec = {
      ...baseSpec,
      name: 'update-reenable-job',
      enabled: false,
    };
    const job2 = await store.add(spec2, 2_000_000);
    const updated2 = await store.update(
      job2.id,
      { ...spec2, enabled: true },
      job2.revision ?? 1,
      2_500_000,
    );
    expect(updated2.nextRunAt).toBe(2_560_000);
  });
});

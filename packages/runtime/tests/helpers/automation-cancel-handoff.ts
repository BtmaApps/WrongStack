import { mkdtemp, realpath, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AutomationService } from '../../src/automation/service.js';
import { AutomationStore } from '../../src/automation/store.js';

export async function automationCancelHandoff(mode: 'queued' | 'claim' | 'active') {
  const base = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(base, 'wrongstack-cancel-handoff-'));
  if (path.dirname(root) !== base || !path.basename(root).startsWith('wrongstack-cancel-handoff-'))
    throw new Error('Unsafe fixture');
  const claimed = Promise.withResolvers<void>();
  const handoff = Promise.withResolvers<void>();
  const executing = Promise.withResolvers<void>();
  const complete = Promise.withResolvers<void>();
  class GatedStore extends AutomationStore {
    override async claim(...args: Parameters<AutomationStore['claim']>) {
      const result = await super.claim(...args);
      if (result && mode === 'claim') {
        claimed.resolve();
        await handoff.promise;
      }
      return result;
    }
  }
  const store = new GatedStore(path.join(root, 'state'));
  const job = await store.add(
    {
      name: 'test',
      projectRoot: root,
      image: 'trusted:1',
      prompt: 'check',
      envNames: [],
      yolo: false,
      enabled: true,
      timeoutMs: 60_000,
    },
    1000,
  );
  const run = await store.enqueue(job.id, 'manual', 'test-delivery', 'default', '', 1000);
  const service = new AutomationService(store, async (options) => {
    executing.resolve();
    const signal = options.signal!;
    const abort = () => complete.resolve();
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) complete.resolve();
      await complete.promise;
      return {
        id: options.id!,
        ownerToken: options.ownerToken!,
        exitCode: 0,
        snapshotRevision: 'a'.repeat(40),
        patch: '',
        output: '',
        cleanup: 'removed' as const,
      };
    } finally {
      signal.removeEventListener('abort', abort);
    }
  });
  let ticking: Promise<void> | undefined;
  try {
    if (mode !== 'queued') {
      ticking = service.tick(1000);
      await (mode === 'claim' ? claimed.promise : executing.promise);
    }
    const pending = service.cancel(run.id).then(
      () => 'ok',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    handoff.resolve();
    const outcome = await pending;
    complete.resolve();
    await ticking;
    await service.idle();
    return {
      outcome,
      status: (await store.snapshot()).runs.find((item) => item.id === run.id)!.status,
    };
  } finally {
    handoff.resolve();
    complete.resolve();
    await ticking;
    await service.stop();
    await rm(root, { recursive: true, force: true });
  }
}

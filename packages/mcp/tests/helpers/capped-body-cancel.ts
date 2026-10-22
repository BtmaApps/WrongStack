import { readBodyCapped } from '../../src/read-body.js';

export async function cappedBodyCancellation(cap = 2) {
  const cancelEntered = Promise.withResolvers<void>();
  const cancelFinished = Promise.withResolvers<void>();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('oversized'));
    },
    cancel() {
      cancelEntered.resolve();
      return cancelFinished.promise;
    },
  });
  const outcome = readBodyCapped({ body, text: async () => 'unused' }, cap).then(
    () => 'success',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  try {
    await cancelEntered.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const beforeCleanup = await Promise.race([outcome, Promise.resolve('PENDING')]);
    return { beforeCleanup, locked: body.locked };
  } finally {
    cancelFinished.resolve();
    await outcome;
  }
}

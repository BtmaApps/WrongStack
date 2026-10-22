import { redirectSafeFetch } from '../../src/redirect-safe-fetch.js';

export async function redirectBodyDisposal(
  mode: 'control' | 'protocol' | 'private',
  cancellation: 'ok' | 'reject' | 'throw' = 'ok',
) {
  let cancelled = 0;
  let calls = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (mode === 'control') {
        controller.enqueue(new TextEncoder().encode('redirect body'));
        controller.close();
      }
    },
    cancel() {
      cancelled++;
      if (cancellation === 'throw') throw new Error('cancel failed');
      if (cancellation === 'reject') return Promise.reject(new Error('cancel rejected'));
      return undefined;
    },
  });
  const location =
    mode === 'protocol'
      ? 'file:///discarded'
      : mode === 'private'
        ? 'http://127.0.0.1/blocked'
        : '/next';
  const redirect = new Response(body, { status: 307, headers: { location } });
  const fetchImpl = (async () =>
    ++calls === 1 ? redirect : new Response(null, { status: 200 })) as typeof fetch;
  const outcome = await redirectSafeFetch(fetchImpl, 'https://api.example.test/start', {
    headers: {},
  }).then(
    () => 'ok',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  return { cancelled, calls, used: redirect.bodyUsed, outcome };
}

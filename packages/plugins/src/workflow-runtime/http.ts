import { str } from './index.js';

export function localUrl(value: unknown): URL {
  const url = new URL(str(value, 'url'));
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Use an explicit loopback HTTP(S) URL without credentials (127.0.0.1 or [::1])',
    );
  return url;
}
export async function localRequest(url: URL, init: RequestInit, signal: AbortSignal) {
  const started = Date.now();
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  let body = '';
  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1_000_000) throw new Error('HTTP body exceeds 1 MB');
        body += decoder.decode(part.value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  return { status: response.status, body, durationMs: Date.now() - started };
}

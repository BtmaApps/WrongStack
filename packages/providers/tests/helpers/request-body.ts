import { zstdDecompressSync } from 'node:zlib';

/**
 * The JSON a fake `fetch` received. The Codex transport zstd-compresses large
 * bodies (`content-encoding: zstd`), exactly as it will for the real backend,
 * so a test that inspects the wire body must decode it first.
 */
export function requestBodyText(
  init: { body?: unknown; headers?: unknown } | undefined,
  fallback = '{}',
): string {
  const body = init?.body;
  if (body === undefined || body === null) return fallback;
  if (typeof body === 'string') return body;
  const encoding = new Headers(init?.headers as ConstructorParameters<typeof Headers>[0]).get(
    'content-encoding',
  );
  const bytes = body as Uint8Array;
  return encoding === 'zstd'
    ? zstdDecompressSync(bytes).toString('utf8')
    : Buffer.from(bytes).toString('utf8');
}

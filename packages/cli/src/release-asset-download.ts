import { createHash } from 'node:crypto';
import * as fsp from 'node:fs/promises';

/** Download one release asset without buffering beyond its configured ceiling. */
export async function downloadReleaseAsset(
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'wrongstack-cli' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`download ${url} responded ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new Error(`download ${url} is too large`);
  if (!res.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let received = 0;
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new Error(`download ${url} is too large`);
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received);
}

/**
 * Stream one release asset into `file` (created exclusively) and return its
 * SHA-256. The background self-update uses this so a 100+ MB executable never
 * sits in the session's heap. `file` is removed when the download fails.
 */
export async function downloadReleaseAssetToFile(
  url: string,
  file: string,
  options: { timeoutMs: number; maxBytes: number; signal?: AbortSignal | undefined },
): Promise<string> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const res = await fetch(url, {
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    headers: { 'User-Agent': 'wrongstack-cli' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`download ${url} responded ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > options.maxBytes) throw new Error(`download ${url} is too large`);

  const hash = createHash('sha256');
  const out = await fsp.open(file, 'wx', 0o600);
  let received = 0;
  try {
    if (res.body) {
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > options.maxBytes) {
            await reader.cancel();
            throw new Error(`download ${url} is too large`);
          }
          hash.update(value);
          await out.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    await out.sync();
  } catch (err) {
    await out.close().catch(() => undefined);
    await fsp.rm(file, { force: true });
    throw err;
  }
  await out.close();
  return hash.digest('hex');
}

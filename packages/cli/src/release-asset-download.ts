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

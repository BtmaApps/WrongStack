import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { Sage } from '@wrongstack/sage';

export interface MemoryEvidenceSnapshot {
  fingerprint: string;
  files: Array<{ path: string; hash: string; text: string }>;
  unavailable: string[];
  changedAnchor: boolean;
}

/** Bounded, project-contained source evidence. Never follows links outside the project. */
export async function snapshotMemoryEvidence(
  root: string,
  memory: Sage,
): Promise<MemoryEvidenceSnapshot> {
  const canonicalRoot = await realpath(root);
  const paths = [
    ...new Set(
      [...memory.anchors.map((a) => a.path), ...memory.sources.map((s) => s.path)].filter(
        (p): p is string => Boolean(p),
      ),
    ),
  ].slice(0, 4);
  const files: MemoryEvidenceSnapshot['files'] = [];
  const unavailable: string[] = [];
  let changedAnchor = false;
  for (const sourcePath of paths) {
    try {
      const canonical = await realpath(path.resolve(canonicalRoot, sourcePath));
      const relative = path.relative(canonicalRoot, canonical);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new Error('outside project');
      const info = await stat(canonical);
      if (!info.isFile() || info.size > 64 * 1024)
        throw new Error('source unavailable or too large');
      const handle = await open(canonical, 'r');
      let data: Buffer;
      try {
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.ino !== info.ino ||
          opened.dev !== info.dev ||
          (await realpath(canonical)) !== canonical
        )
          throw new Error('source changed while opening');
        // Do not allocate the whole file if another writer grows it after stat.
        const buffer = Buffer.alloc(64 * 1024 + 1);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
          if (bytesRead === 0) break;
          length += bytesRead;
        }
        if (length > 64 * 1024) throw new Error('source grew');
        data = buffer.subarray(0, length);
      } finally {
        await handle.close();
      }
      // Match SAGE anchor verification's persisted hash vocabulary exactly.
      const hash = `sha256:${createHash('sha256').update(data).digest('hex')}`;
      files.push({ path: sourcePath, hash, text: data.toString('utf8').slice(0, 6000) });
      if (
        memory.anchors.some((a) => a.path === sourcePath && a.contentHash && a.contentHash !== hash)
      )
        changedAnchor = true;
    } catch {
      unavailable.push(sourcePath);
    }
  }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ files: files.map(({ path, hash }) => ({ path, hash })), unavailable }))
    .digest('hex');
  return { fingerprint, files, unavailable, changedAnchor };
}

export interface MemoryCompanionVerdict {
  verdict: 'supported' | 'outdated' | 'contradicted' | 'unverifiable' | 'irrelevant';
  summary: string;
  evidence: Array<{ path: string; quote: string }>;
}

export function parseMemoryCompanionVerdict(
  raw: string,
  snapshot: MemoryEvidenceSnapshot,
): MemoryCompanionVerdict | undefined {
  try {
    if (raw.length > 8000) return;
    const value = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, ''),
    ) as MemoryCompanionVerdict;
    if (
      !['supported', 'outdated', 'contradicted', 'unverifiable', 'irrelevant'].includes(
        value.verdict,
      ) ||
      typeof value.summary !== 'string' ||
      !value.summary.trim() ||
      value.summary.length > 800 ||
      !Array.isArray(value.evidence) ||
      value.evidence.length > 4
    )
      return;
    if (
      value.evidence.some(
        (e) =>
          !e ||
          typeof e.path !== 'string' ||
          typeof e.quote !== 'string' ||
          e.quote.trim().length < 12 ||
          e.quote.length > 400 ||
          !snapshot.files.some((f) => f.path === e.path && f.text.includes(e.quote)),
      )
    )
      return;
    if (
      ['supported', 'outdated', 'contradicted'].includes(value.verdict) &&
      value.evidence.length === 0
    )
      return;
    return {
      verdict: value.verdict,
      summary: value.summary,
      evidence: value.evidence.map(({ path, quote }) => ({ path, quote })),
    };
  } catch {
    return;
  }
}

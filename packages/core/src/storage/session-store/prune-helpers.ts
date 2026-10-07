import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  isSessionTranscriptFileName,
  stripSessionTranscriptExtension,
} from '../../utils/session-scoped-path.js';
import { SESSION_SIDECAR_SUFFIXES } from './delete-session-artifacts.js';

/**
 * Prunable === is a transcript. This module held the only complete sidecar
 * list in the codebase while the listing scans held shorter ones; sharing the
 * predicate is what stops them disagreeing again.
 */
export function isPrunableSessionJsonl(name: string): boolean {
  return isSessionTranscriptFileName(name);
}

/**
 * How many transcripts the sweep ages and deletes at once.
 *
 * Bounded rather than unbounded: the work is filesystem round trips, so full
 * concurrency buys little past the point where the OS is saturated, while an
 * unbounded `Promise.all` over a store with tens of thousands of expired
 * sessions would hold that many handles open at once.
 */
const PRUNE_CONCURRENCY = 16;

export async function pruneSessionFiles(
  storeDir: string,
  maxAgeDays: number,
  deleteSession: (id: string) => Promise<void>,
  isSessionInUse?: ((sessionId: string) => Promise<string | null>) | undefined,
): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  let deleted = 0;

  /**
   * Age-check one transcript and remove its session. Resolves true when the
   * session was deleted.
   */
  const pruneFile = async (jsonlPath: string, id: string): Promise<boolean> => {
    try {
      const stat = await fsp.stat(jsonlPath);
      if (stat.mtimeMs >= cutoff) return false;
      /* v8 ignore start -- defensive: file vanished between readdir and stat */
    } catch {
      return false;
    }
    /* v8 ignore stop */
    if (isSessionInUse && (await isSessionInUse(id))) return false;
    await deleteSession(id);
    return true;
  };

  /* v8 ignore next -- defensive: store dir is ensured before prune runs */
  const entries = await fsp.readdir(storeDir, { withFileTypes: true }).catch(() => []);

  // Collect every transcript candidate first. The sweep's real cost is the
  // per-session `stat` + delete pair, and issuing those one awaited round trip
  // at a time made a retention run scale its wall time with the number of
  // EXPIRED sessions — exactly the store size a sweep exists to shrink.
  const candidates: Array<{ jsonlPath: string; id: string }> = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      if (isPrunableSessionJsonl(entry.name)) {
        candidates.push({
          jsonlPath: path.join(storeDir, entry.name),
          id: stripSessionTranscriptExtension(entry.name),
        });
      }
      continue;
    }
    /* v8 ignore next -- defensive: root entries are only files or directories */
    if (!entry.isDirectory()) continue;
    const dateDir = path.join(storeDir, entry.name);
    /* v8 ignore next -- defensive: dateDir came from readdir and is readable */
    const files = await fsp.readdir(dateDir, { withFileTypes: true }).catch(() => []);
    for (const file of files) {
      if (!file.isFile() || !isPrunableSessionJsonl(file.name)) continue;
      const base = stripSessionTranscriptExtension(file.name);
      candidates.push({ jsonlPath: path.join(dateDir, file.name), id: `${entry.name}/${base}` });
    }
  }

  // Fixed-width worker pool over the shared cursor: the same fs operations as
  // before, issued concurrently instead of serialized, with a bound so a store
  // with tens of thousands of expired sessions cannot exhaust file handles.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      const candidate = candidates[index];
      if (!candidate) return;
      if (await pruneFile(candidate.jsonlPath, candidate.id)) deleted++;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PRUNE_CONCURRENCY, candidates.length) }, () => worker()),
  );

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dateDir = path.join(storeDir, entry.name);
    try {
      // A shard still inside the retention window can be one a concurrent
      // create has just made: create runs ensureShardDir, awaits its index
      // append, and only then opens the transcript. Sweeping that empty (or
      // manifest-only) directory made the create's open fail with ENOENT.
      // Date shards are named by the session's UTC start day; anything else
      // falls back to the directory's own mtime.
      if (await withinRetention(dateDir, entry.name, cutoff)) continue;
      const remaining = await fsp.readdir(dateDir, { withFileTypes: true });
      if (remaining.length === 0) {
        /* v8 ignore next -- best-effort: rmdir of a confirmed-empty dir does not reject */
        await fsp.rmdir(dateDir).catch(() => undefined);
        continue;
      }
      // A pruned date directory is rarely literally empty: the shard's own
      // `_manifest.json` stays behind, and so does any per-session sidecar
      // whose suffix the delete path did not know about. Requiring an empty
      // directory therefore never fired — a real store carried 36 date
      // directories holding nothing but those leftovers, the oldest more than
      // two months past the retention window.
      //
      // Remove the directory when nothing session-bearing is left. Anything
      // unrecognized — a subdirectory, a file that is neither the shard
      // manifest nor a known sidecar — keeps it, so an unexpected artifact is
      // preserved rather than swept up.
      if (remaining.every((child) => child.isFile() && isDisposableLeftover(child.name))) {
        await fsp.rm(dateDir, { recursive: true, force: true }).catch(() => undefined);
      }
    } catch {
      // best-effort
    }
  }

  return deleted;
}

/** True when the shard directory may still receive or hold a session younger than `cutoff`. */
async function withinRetention(dir: string, name: string, cutoff: number): Promise<boolean> {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) {
    const dayStart = Date.parse(`${name}T00:00:00.000Z`);
    if (Number.isFinite(dayStart)) return dayStart + 86_400_000 > cutoff;
  }
  const stat = await fsp.stat(dir);
  return stat.mtimeMs >= cutoff;
}

/**
 * True for a file that only exists to describe sessions in this directory, and
 * so has nothing left to describe once every transcript is gone.
 */
function isDisposableLeftover(name: string): boolean {
  if (name === '_manifest.json') return true;
  const lower = name.toLowerCase();
  return (
    SESSION_SIDECAR_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
    lower.endsWith('.summary.json')
  );
}

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { toErrorMessage } from '../../utils/index.js';
import { clearRedoStash } from '../session-writer-redo.js';
import { sessionPath as sessionStorePath, shardManifestPath } from './paths.js';

export type DeleteSessionArtifactsOptions = {
  rootDir: string;
  id: string;
  jsonlPath: string;
};

/**
 * Per-session sidecars written next to the transcript, all of which die with
 * it. Exported so the prune sweep can recognize the same set when it decides
 * whether a date directory still holds anything worth keeping.
 *
 * The JSON sidecars plus `.replay.jsonl` (ReplayLogStore) are here for one
 * reason: `sessionScopedPath` writes them next to the transcript under the same
 * session id, so each belongs to exactly one session and describes nothing once
 * that session is gone. A replay log is only ever read back for a session that
 * still exists.
 *
 * `.annotations.json` (no trailing `l`) is the LIVE annotations sidecar, and it
 * is the one that matters. `AnnotationsStore.filePath` writes exactly that name
 * (`annotations-store.ts:329`), so every annotated session writes one.
 * `.annotations.jsonl` is listed alongside it only so old directories still
 * classify correctly; nothing emits it. Listing the legacy name without the
 * live one deletes a file no producer writes while leaving every real
 * annotations file behind, outliving its session and pinning its date shard
 * forever.
 *
 * `.audit.jsonl` (ToolAuditLog) is in the list too, which is a decision rather
 * than an oversight: it is tamper evidence, so leaving it behind would preserve
 * the trail of sessions a user deliberately deleted. It was weighed against
 * two costs. `wstack audit --list` can then only surface audit logs belonging
 * to sessions that still exist — but the transcript is already gone in that
 * case, so there is nothing to correlate the trail to. And every session that
 * ever recorded tool calls would otherwise pin its date shard open forever,
 * which is the unbounded leak a285b18d3 was written to stop. A retention
 * policy for audit trails is better expressed as an explicit export than as an
 * accidental side effect of the delete path.
 */
export const SESSION_SIDECAR_SUFFIXES: readonly string[] = Object.freeze([
  '.plan.json',
  '.tasks.json',
  '.todos.json',
  '.completed-work.json',
  '.replay.jsonl',
  '.annotations.json',
  '.annotations.jsonl',
  '.audit.jsonl',
]);

export async function deleteSessionArtifacts({
  rootDir,
  id,
  jsonlPath,
}: DeleteSessionArtifactsOptions): Promise<void> {
  const shardDir = path.dirname(jsonlPath);
  const base = path.basename(id);
  const sessDir = path.join(shardDir, base);

  const uniquePaths = [
    ...new Set([
      jsonlPath,
      sessionStorePath(rootDir, id, '.jsonl'),
      sessionStorePath(rootDir, id, '.jsonl.gz'),
      sessionStorePath(rootDir, id, '.summary.json'),
    ]),
  ];
  const deletions: Array<Promise<void>> = [
    ...uniquePaths.map((target) => fsp.unlink(target)),
    // Every per-session sidecar written next to the transcript. A suffix
    // missing here does not fail loudly — it just outlives the session it
    // belongs to, keeps its date directory from ever being removed, and
    // accumulates. `.completed-work.json` did exactly that.
    ...SESSION_SIDECAR_SUFFIXES.map((suffix) => fsp.unlink(sessionStorePath(rootDir, id, suffix))),
    fsp.unlink(shardManifestPath(rootDir, path.dirname(id) === '.' ? '' : path.dirname(id))),
    // The `/redo` stash of rewound turns (session-writer-redo.ts).
    clearRedoStash(jsonlPath),
  ];

  const results = await Promise.allSettled(deletions);
  for (const result of results) {
    if (result.status === 'rejected') {
      warnDeleteFailure(id, result.reason);
    }
  }

  await fsp.rm(sessDir, { recursive: true, force: true }).catch((err) => {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'session_store.rmdir_failed',
        sessionId: id,
        message: toErrorMessage(err),
        timestamp: new Date().toISOString(),
      }),
    );
  });
}

function warnDeleteFailure(id: string, reason: unknown): void {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if ((reason as NodeJS.ErrnoException)?.code === 'ENOENT') return;
  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'session_store.delete_failed',
      sessionId: id,
      message: msg,
      timestamp: new Date().toISOString(),
    }),
  );
}

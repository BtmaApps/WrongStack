import * as fs from 'node:fs';
import * as path from 'node:path';

/** Size cap for the detached daemon's log; one rotated generation is kept. */
export const SAGE_DAEMON_LOG_MAX_BYTES = 5 * 1024 * 1024;
export const SAGE_DAEMON_LOG_ROTATED_SUFFIX = '.1';

/**
 * Open the parent's copy of the detached daemon's stdout/stderr sink and
 * write a spawn header.
 *
 * Best-effort by contract: ANY failure (store dir that cannot be created,
 * rotation race, EMFILE) returns null and the caller falls back to
 * `stdio: 'ignore'` — an unusable log must never block a spawn that could
 * otherwise win the ownership election.
 *
 * The fd is handed to `spawn`'s stdio array (the kernel dups it into the
 * child) and closed in the parent on 'spawn' or 'error'. Appends across
 * processes interleave lines, which is fine for a diagnostic log; when the
 * file exceeds `maxBytes` it is renamed once (`.1`) so the sink cannot grow
 * without bound.
 */
export function openDaemonLogFd(
  logPath: string,
  header: string,
  maxBytes: number = SAGE_DAEMON_LOG_MAX_BYTES,
): number | null {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    try {
      if (fs.statSync(logPath).size > maxBytes) {
        fs.renameSync(logPath, logPath + SAGE_DAEMON_LOG_ROTATED_SUFFIX);
      }
    } catch {
      // First run, or a sibling client rotated it first — appending still works.
    }
    const fd = fs.openSync(logPath, 'a');
    fs.writeFileSync(fd, header);
    return fd;
  } catch {
    return null;
  }
}

/** Close the parent's copy of the log fd; safe to call twice. */
export function closeDaemonLogFd(fd: number | null): void {
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    // Already closed — the 'spawn' and 'error' handlers can both fire a close.
  }
}

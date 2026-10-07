/**
 * Ledger file paths and the cross-process store lock for the review claim
 * registry. Split out of review-claim-registry.ts.
 */
import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import { hostname } from 'node:os';
import * as path from 'node:path';
import { isPidAlive } from '../utils/pid.js';

/**
 * In-flight review claims are scoped to the whole working tree, not to one
 * session: parallel hosts on the same tree share a JSONL claim ledger under
 * `<cwd>/.wrongstack/review-claims.jsonl`, so a fingerprint claimed by session
 * A is skipped by session B. Claims are released on review completion and
 * expire after {@link DEFAULT_CLAIM_TTL_MS} so a crashed host cannot wedge
 * the file forever.
 *
 * When the ledger is unwritable (read-only tree, minimal hosts, sandboxed
 * tests), the registry falls back to a per-EventBus in-memory ledger that
 * preserves the previous within-session dedup behavior.
 */
const CLAIMS_FILE = 'review-claims.jsonl';

export const LOCK_WAIT_MS = 5_000;

const LOCK_RETRY_MAX_MS = 50;

export const LOCK_STALE_MS = 30_000;

/** Same-host live-owner lock cap — sub-second holds never reach it. */
const SAME_HOST_STALE_MS = 2 * LOCK_STALE_MS;

/**
 * Extra budget for the one lock-contention retry before degraded fallback —
 * long enough to also cover a foreign-host lease break (LOCK_STALE_MS) and
 * the same-host wedged-holder cap (SAME_HOST_STALE_MS).
 */
export const LOCK_RETRY_BUDGET_MS = SAME_HOST_STALE_MS + 5_000;

/** Distinguishes a wedged lock from a storage failure in the fallback path. */
export const CLAIM_STORE_LOCK_TIMEOUT = 'CLAIM_STORE_LOCK_TIMEOUT';

/** Machine name stamped into locks so foreign hosts never misread a pid. */
const HOST_NAME = hostname();

function lockOwnerStamp(): string {
  return `${HOST_NAME}:${process.pid}`;
}

/** Throttle fallback warns — a wedged store must not spam the console. */
let lastFallbackWarnAt = 0;

const FALLBACK_WARN_INTERVAL_MS = 60_000;

export function warnFallbackOnce(message: string): void {
  const now = Date.now();
  if (now - lastFallbackWarnAt < FALLBACK_WARN_INTERVAL_MS) return;
  lastFallbackWarnAt = now;
  console.warn(message);
}

/**
 * Decide whether a contended lock file is stale and may be removed.
 *
 * Locks are stamped `host:pid`. A pid is only interpretable on the host that
 * wrote it, so:
 *  - same-host locks: broken iff the owner pid is dead, or the lock is held
 *    implausibly long (past {@link SAME_HOST_STALE_MS}) — a live-but-wedged
 *    holder must not degrade cross-session dedup forever;
 *  - foreign-host or ownerless locks: broken only past the mtime lease cap.
 * Exported for unit tests.
 */
/**
 * Re-verify the stale classification immediately before the atomic break, so a
 * winner that re-created the lock between classification and rename is not
 * displaced. The residual window shrinks to the two adjacent syscalls between
 * this verification read and the rename.
 */
async function breakStaleLockVerified(
  lockPath: string,
  verify: () => Promise<boolean>,
): Promise<boolean> {
  if (!(await verify())) return false;
  return (await breakLockAtomically(lockPath)) === true;
}

export async function breakStaleLock(lockPath: string): Promise<boolean> {
  try {
    const ownerRaw = await fsp.readFile(lockPath, 'utf8').catch(() => null);
    if (ownerRaw !== null) {
      const [ownerHost, pidRaw] = ownerRaw.trim().split(':', 2);
      const ownerPid = Number.parseInt(pidRaw ?? '', 10);
      if (ownerHost === HOST_NAME && Number.isInteger(ownerPid) && ownerPid > 0) {
        if (isPidAlive(ownerPid)) {
          const st = await fsp.stat(lockPath);
          if (Date.now() - st.mtimeMs > SAME_HOST_STALE_MS) {
            return await breakStaleLockVerified(lockPath, async () => {
              const st2 = await fsp.stat(lockPath);
              return Date.now() - st2.mtimeMs > SAME_HOST_STALE_MS;
            });
          }
          return false;
        }
        return await breakStaleLockVerified(lockPath, async () => {
          const content = await fsp.readFile(lockPath, 'utf8').catch(() => '');
          return content.trim() === ownerRaw.trim();
        });
      }
    }
    const st = await fsp.stat(lockPath);
    if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
      return await breakStaleLockVerified(lockPath, async () => {
        const st2 = await fsp.stat(lockPath);
        return Date.now() - st2.mtimeMs > LOCK_STALE_MS;
      });
    }
  } catch {
    /* lock vanished — retry open */
  }
  return false;
}

/**
 * Remove a stale lock file via atomic RENAME to a unique tombstone, never
 * unlink: with unlink, two waiters can both read the stale lock and one's
 * unlink can remove the OTHER's fresh lock, letting both into the critical
 * section (POSIX). Rename wins for exactly one waiter; losers get ENOENT and
 * simply keep waiting on the winner's fresh lock.
 */
async function breakLockAtomically(lockPath: string): Promise<boolean> {
  // `.tmp` suffix so any store-level tmp pruner can reclaim a tombstone left
  // by a breaker that died before its fire-and-forget cleanup ran.
  const tombstone = `${lockPath}.stale-${randomUUID()}.tmp`;
  try {
    await fsp.rename(lockPath, tombstone);
  } catch {
    // EPERM (AV), ENOENT (already broken), or a lost race — not ours to break.
    return false;
  }
  // The tombstone is ours alone — remove it right away.
  void fsp.unlink(tombstone).catch(() => undefined);
  return true;
}

/**
 * Serialize read-modify-append cycles on the shared ledger with an exclusive
 * lock file (O_CREAT|O_EXCL), the same pattern session-registry.ts uses.
 * A crashed holder leaves a stale lock which is broken by pid liveness (same
 * host) or the mtime lease cap (foreign host / ownerless). Contention past
 * `waitMs` surfaces as a typed {@link CLAIM_STORE_LOCK_TIMEOUT} error so the
 * caller can retry with a longer budget before degrading.
 */
export async function withStoreLock<T>(
  storeDir: string,
  fn: () => Promise<T>,
  waitMs = LOCK_WAIT_MS,
): Promise<T> {
  const lockPath = lockFilePath(storeDir);
  await fsp.mkdir(storeDir, { recursive: true });
  const deadline = Date.now() + waitMs;
  let attempt = 0;
  for (;;) {
    let handle = await fsp.open(lockPath, 'wx').catch(() => null);
    if (!handle && (await breakStaleLock(lockPath))) {
      handle = await fsp.open(lockPath, 'wx').catch(() => null);
    }
    if (handle) {
      let stampFailed = false;
      try {
        // Stamp the owner BEFORE any critical-section work: an ownerless lock
        // would be stolen by a peer past the mtime cap while we are still
        // mid-critical-section. Retry transient Windows I/O, then fail closed.
        let stamped = false;
        for (let stampAttempt = 0; stampAttempt < 3 && !stamped; stampAttempt++) {
          try {
            await handle.writeFile(lockOwnerStamp());
            stamped = true;
          } catch {
            if (stampAttempt < 2) await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
        if (!stamped) {
          stampFailed = true;
          throw new Error('failed to stamp claim lock owner');
        }
        return await fn();
      } finally {
        await handle.close().catch(() => undefined);
        if (stampFailed) {
          // The lock is ours (we created it microseconds ago; no breaker can
          // have stolen it). Remove it now the handle is closed, or every
          // waiter degrades to in-memory dedup until the mtime cap. The
          // fail-closed error still propagates (no return in this finally).
          await fsp.unlink(lockPath).catch(() => undefined);
        } else {
          // Only unlink a lock we still own: a stale-lock breaker may have
          // stolen this lock and re-stamped it with another host:pid, in which
          // case the resumed holder must NOT remove the new owner's lock. An
          // EMPTY read is never ours to unlink — it may be the new owner's
          // lock in its open-to-stamp gap; that lock is mtime-bounded instead.
          const owner = await fsp.readFile(lockPath, 'utf8').catch(() => null);
          if (owner !== null && owner.trim() === lockOwnerStamp()) {
            await fsp.unlink(lockPath).catch(() => undefined);
          }
        }
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw Object.assign(new Error('review claim store lock timeout'), {
        code: CLAIM_STORE_LOCK_TIMEOUT,
      });
    }
    const delay = Math.min(LOCK_RETRY_MAX_MS * (attempt + 1), remaining);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt += 1;
  }
}

export function claimsFilePath(storeDir: string): string {
  return path.join(storeDir, CLAIMS_FILE);
}

function lockFilePath(storeDir: string): string {
  return path.join(storeDir, `${CLAIMS_FILE}.lock`);
}

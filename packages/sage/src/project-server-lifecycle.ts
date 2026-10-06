/**
 * Shutdown and process-signal plumbing of the SAGE project server: the
 * client-socket teardown and the bounded dispatch drain `stop()` runs around
 * its `server.close()`, and the once-per-process SIGINT/SIGTERM guard.
 */
import * as fsPromises from 'node:fs/promises';
import type { ClientState, CompleteSageStore } from './project-server-options.js';
import { send } from './project-server-wire.js';

/**
 * Grace window for the in-flight dispatch drain in `stop()`. Ops parked on a file lock or a slow fs read
 * cannot be cancelled (only `verify` observes the abort signal), so the wait
 * is bounded — shutdown must resolve deterministically, mirroring the 500ms
 * `server.close` fallback below.
 */
const SHUTDOWN_DRAIN_GRACE_MS = 1_000;
/**
 * First half of `stop()`'s transport teardown, run on the snapshot of
 * connected clients: answer every still-unsettled request with a clean
 * stopping rejection, abort in-flight dispatches, then end() each socket.
 */
export function endClientsForShutdown(closing: readonly ClientState[]): void {
  for (const state of closing) {
    // a dispatch in flight would otherwise see nothing but a bare connection
    // close (its response can no longer be written once the socket is
    // destroyed) and hang until its own call timeout. Settled requests are
    // no longer in `unsettled` — their real response already went out.
    for (const id of state.unsettled) {
      send(state, {
        type: 'response',
        id,
        ok: false,
        error: 'SAGE project server is stopping; the request was not completed',
        errorName: 'SageServerStoppingError',
      });
    }
    for (const controller of state.active.values()) {
      controller.abort(new Error('SAGE project server stopping'));
    }
    // end() — NOT destroy() — so the stopping rejections already queued are
    // flushed before FIN: write()+destroy() in the same tick discards the
    // pending userland write queue on Windows named pipes (observed in the
    // round-29 proof: a congested client's parked in-flight request got a
    // bare close instead of its SageServerStoppingError). A client that
    // stops reading cannot hold shutdown open — the force-destroy below
    // bounds the flush window.
    state.socket.end();
  }
}

/**
 * Last half of `stop()`: after the server has closed, give in-flight
 * dispatches a bounded grace window, then dispose the store, remove a POSIX
 * socket file and stop the heap watchdog.
 */
export async function drainAndDisposeAfterStop(ctx: {
  activeDispatches: ReadonlySet<Promise<unknown>>;
  store: CompleteSageStore;
  endpoint: string;
  stopMemoryWatchdog: () => Promise<void> | void;
}): Promise<void> {
  const { activeDispatches, store, endpoint, stopMemoryWatchdog } = ctx;
  // Bounded drain: give in-flight dispatches a short grace window to finish
  // so `store.dispose()` does not close SQLite under a running operation (its
  // caller would otherwise see "database is closed" instead of a clean result
  // or rejection). Ops parked on a file lock or slow fs hold shutdown up to
  // this grace, never longer — shutdown stays deterministic.
  if (activeDispatches.size > 0) {
    await Promise.race([
      Promise.allSettled([...activeDispatches]),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SHUTDOWN_DRAIN_GRACE_MS);
        timer.unref?.();
      }),
    ]);
  }
  await store.dispose().catch(() => {});
  if (process.platform !== 'win32') {
    await fsPromises.rm(endpoint, { force: true }).catch(() => {});
  }
  await stopMemoryWatchdog();
}

/**
 * One SIGINT/SIGTERM pair per PROCESS, not per module instance.
 *
 * The in-process test harness imports this module once per test case with a
 * `?case=<n>` query URL, so every case evaluates this module body fresh; a
 * bare top-level `process.once(signal, ...)` loop accumulates one handler
 * pair per case until Node raises MaxListenersExceededWarning in every
 * coverage run. The guard lives on globalThis under a Symbol.for key: the
 * first evaluation registers the pair, every evaluation re-targets it at its
 * own `stop`, and a fired signal removes the pair (once semantics).
 */
interface SageSignalGuard {
  arm(stop: (signal: string) => Promise<void>): void;
}
const SIGNAL_GUARD: unique symbol = Symbol.for('wrongstack.sage.project-server.signalGuard');

/** Point the process-wide SIGINT/SIGTERM pair at `stop` (registering it once). */
export function armProjectServerSignalGuard(stop: (signal: string) => Promise<void>): void {
  const signalGuardStore = globalThis as typeof globalThis & {
    [SIGNAL_GUARD]?: SageSignalGuard | undefined;
  };
  let signalGuard = signalGuardStore[SIGNAL_GUARD];
  if (!signalGuard) {
    let current: (signal: string) => Promise<void> = async () => undefined;
    let armed = false;
    const handlers = new Map<string, () => void>();
    const disarm = (): void => {
      if (!armed) return;
      armed = false;
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
      handlers.clear();
    };
    signalGuard = {
      arm(next) {
        current = next;
        if (armed) return;
        armed = true;
        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
          const handler = (): void => {
            disarm();
            void current(signal).finally(() => {
              process.exitCode = 0;
            });
          };
          handlers.set(signal, handler);
          process.on(signal, handler);
        }
      },
    };
    signalGuardStore[SIGNAL_GUARD] = signalGuard;
  }
  signalGuard.arm(stop);
}

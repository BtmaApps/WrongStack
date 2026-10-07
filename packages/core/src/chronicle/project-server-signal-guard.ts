/**
 * One SIGINT/SIGTERM pair per PROCESS, not per module instance.
 *
 * The in-process test harness imports this module once per test case with a
 * `?case=<n>` query URL, so every case evaluates this module body fresh; a
 * bare top-level `process.once(signal, ...)` pair accumulates one handler
 * per case until Node raises MaxListenersExceededWarning in every coverage
 * run. The guard lives on globalThis under a Symbol.for key: the first
 * evaluation registers the pair, every evaluation re-targets it at its own
 * `stop`, and a fired signal removes the pair (once semantics).
 */
interface ChronicleSignalGuard {
  arm(stop: (signal: string) => Promise<void>): void;
}
const SIGNAL_GUARD: unique symbol = Symbol.for('wrongstack.chronicle.project-server.signalGuard');

const signalGuardStore = globalThis as typeof globalThis & {
  [SIGNAL_GUARD]?: ChronicleSignalGuard | undefined;
};
export function armChronicleSignalGuard(stop: (signal: string) => Promise<void>): void {
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
            void current(signal);
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

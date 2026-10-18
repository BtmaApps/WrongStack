type Timer = ReturnType<typeof setTimeout>;

export interface SwitchClock {
  set(fn: () => void, ms: number): Timer;
  clear(timer: Timer | undefined): void;
}

const realClock: SwitchClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (timer) => clearTimeout(timer),
};

/**
 * Owns the one pending session open — a switch, a clear, the saved-session
 * restore or the resume after a reconnect — together with its deadline.
 *
 * Every way out (the awaited `session.start`, an `error`, the deadline) goes
 * through `settle`/`cancel`, so the target, the lock and the timer are always
 * released together. Releasing only some of them left a stale target that
 * filtered out every later `session.start`, or a stale timer that re-locked
 * the UI after the switch had already been abandoned.
 *
 * `hold` keeps the latest `session.start` that was set aside while waiting, so
 * an abandoned open can fall back to the session the server actually attached.
 */
export class SessionSwitch<Frame = unknown> {
  private timer: Timer | undefined;
  private target = '';
  private pending = false;
  private held: Frame | undefined;

  constructor(private readonly clock: SwitchClock = realClock) {}

  /** Session id whose `session.start` is awaited; '' accepts any session. */
  get desired(): string {
    return this.target;
  }

  /** True while user writes must wait for the awaited session. */
  get active(): boolean {
    return this.pending;
  }

  begin(desired: string, timeoutMs: number, onTimeout: (held: Frame | undefined) => void): void {
    this.clock.clear(this.timer);
    this.target = desired;
    this.pending = true;
    this.held = undefined;
    this.timer = this.clock.set(() => {
      this.timer = undefined;
      onTimeout(this.release());
    }, timeoutMs);
  }

  /** Whether a `session.start` for `sessionId` may replace the current session. */
  accepts(sessionId: unknown): boolean {
    return !this.target || sessionId === this.target;
  }

  /** Keeps a `session.start` that `accepts` rejected while the open is pending. */
  hold(frame: Frame): void {
    if (this.pending) this.held = frame;
  }

  /** The awaited session arrived. */
  settle(): void {
    this.clock.clear(this.timer);
    this.timer = undefined;
    this.release();
  }

  /** Abandons a pending open (e.g. after an `error`). */
  cancel(): { pending: boolean; held: Frame | undefined } {
    const pending = this.pending || this.target !== '';
    this.clock.clear(this.timer);
    this.timer = undefined;
    return { pending, held: this.release() };
  }

  private release(): Frame | undefined {
    const held = this.held;
    this.held = undefined;
    this.target = '';
    this.pending = false;
    return held;
  }
}

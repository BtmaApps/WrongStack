import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Spinner } from '../src/spinner.js';

const originalNoColor = process.env.NO_COLOR;

beforeAll(() => {
  delete process.env.NO_COLOR;
});

afterAll(() => {
  if (originalNoColor === undefined) {
    delete process.env.NO_COLOR;
  } else {
    process.env.NO_COLOR = originalNoColor;
  }
});

// Minimal mock stream that tracks writes
class MockStream extends Writable {
  writes: string[] = [];
  isTTY = true;

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    cb();
  }
}

describe('Spinner', () => {
  let stream: MockStream;
  let spinner: Spinner;

  beforeEach(() => {
    stream = new MockStream();
    spinner = new Spinner(stream as never as NodeJS.WriteStream, { enabled: true });
  });

  afterEach(() => {
    spinner.stop();
  });

  describe('start / stop', () => {
    it('writes a frame when started', () => {
      spinner.start('Thinking');
      // First frame written
      expect(stream.writes.length).toBeGreaterThan(0);
    });

    it('is a no-op when already active', () => {
      spinner.start('Thinking');
      const countBefore = stream.writes.length;
      spinner.start('Thinking again'); // same label
      // Should not write duplicate frames on same label
      expect(stream.writes.length).toBe(countBefore);
    });

    it('stop clears the timer and line', () => {
      spinner.start('Thinking');
      spinner.stop();
      // stop should have written a clear line
      expect(stream.writes.some((w) => w.includes('\r'))).toBe(true);
    });

    it('multiple stops are safe', () => {
      spinner.start('Thinking');
      spinner.stop();
      const afterFirstStop = stream.writes.length;
      expect(() => {
        spinner.stop();
        spinner.stop();
      }).not.toThrow();
      // "Safe" means more than "did not throw": a repeat stop must not write
      // another clear-line, or it would erase whatever was printed after the
      // spinner ended.
      expect(stream.writes.length).toBe(afterFirstStop);
    });
  });

  describe('stopWith', () => {
    it('writes the note after stopping', () => {
      spinner.start('Thinking');
      spinner.stopWith('✓ done in 1.4s');
      const noteWritten = stream.writes.some((w) => w.includes('✓ done in 1.4s'));
      expect(noteWritten).toBe(true);
    });
  });

  describe('setContext', () => {
    it('stores context info without throwing', () => {
      spinner.start('Thinking');
      expect(() => spinner.setContext({ used: 50000, max: 200000 })).not.toThrow();
    });

    it('can clear context by setting undefined', () => {
      spinner.start('Thinking');
      spinner.setContext({ used: 50000, max: 200000 });
      expect(() => spinner.setContext(undefined)).not.toThrow();
    });
  });

  describe('disabled state', () => {
    it('is a no-op when enabled is false', () => {
      const disabledSpinner = new Spinner(stream as never as NodeJS.WriteStream, {
        enabled: false,
      });
      disabledSpinner.start('Thinking');
      // No writes should happen
      expect(stream.writes.length).toBe(0);
    });
  });
});

// renderProgress is not exported, so it is exercised through the context chip
// the spinner writes. The bar is 8 cells wide: `FILLED.repeat(n) + EMPTY.repeat(8-n)`.
describe('renderProgress (via Spinner)', () => {
  const FILLED = '█';
  const EMPTY = '░';

  // `setContext` only stores the value — the chip reaches the stream on the
  // next 80ms frame, so the render has to be driven by the clock.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The frame the spinner wrote after `ctx` was applied. */
  function renderWith(ctx: { used: number; max: number }): string {
    const stream = new MockStream();
    const spinner = new Spinner(stream as never as NodeJS.WriteStream, { enabled: true });
    spinner.start('test');
    spinner.setContext(ctx);
    stream.writes.length = 0; // drop the pre-context frame
    vi.advanceTimersByTime(80); // one tick → one render with the chip
    spinner.stop();
    return stream.writes.join('');
  }

  it('renders 0% as all empty bars', () => {
    const out = renderWith({ used: 0, max: 100 });
    // This test previously wrote to a `vi.fn()` and asserted nothing, so it
    // passed whatever the bar looked like — including not rendering at all.
    expect(out).toContain(EMPTY.repeat(8));
    expect(out).not.toContain(FILLED);
    expect(out).toContain('0%');
  });

  it('renders 100% as all filled bars', () => {
    const out = renderWith({ used: 100, max: 100 });
    expect(out).toContain(FILLED.repeat(8));
    expect(out).not.toContain(EMPTY);
    expect(out).toContain('100%');
  });

  it('renders half usage as half filled', () => {
    const out = renderWith({ used: 50, max: 100 });
    expect(out).toContain(`${FILLED.repeat(4)}${EMPTY.repeat(4)}`);
    expect(out).toContain('50%');
  });

  // `filled = clamped === 0 ? 0 : Math.max(1, …)` — a deliberate floor: any
  // non-zero usage shows at least one block, so "barely started" never looks
  // identical to "untouched". Rounding alone would give 0 here.
  it('shows one filled block for non-zero usage that rounds to zero', () => {
    const out = renderWith({ used: 1, max: 100 });
    expect(out).toContain(`${FILLED}${EMPTY.repeat(7)}`);
    expect(out).toContain('1%');
  });

  // The ratio is clamped to [0,1] before rendering, so bad inputs cannot
  // produce a bar wider than the 8 cells the line is laid out for.
  it('clamps over- and under-run instead of overflowing the bar', () => {
    const over = renderWith({ used: 500, max: 100 });
    expect(over).toContain(FILLED.repeat(8));
    expect(over).not.toContain(FILLED.repeat(9));

    const under = renderWith({ used: -50, max: 100 });
    expect(under).toContain(EMPTY.repeat(8));
    expect(under).toContain('0%');
  });
});

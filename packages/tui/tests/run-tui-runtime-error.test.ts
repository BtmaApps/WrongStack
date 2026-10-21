import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('ink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ink')>()),
  render: boundary.render,
}));
const writes: Array<{ stream: string; text: string }> = [];
let restoreTerminal: (() => void) | undefined;
let stdinTty: PropertyDescriptor | undefined;
let stdoutTty: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.resetModules();
  boundary.render.mockReset();
  writes.length = 0;
  stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    writes.push({ stream: 'out', text: String(chunk) });
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    writes.push({ stream: 'err', text: String(chunk) });
    return true;
  }) as typeof process.stderr.write);
});
afterEach(() => {
  restoreTerminal?.();
  restoreTerminal = undefined;
  vi.restoreAllMocks();
  if (stdinTty) Object.defineProperty(process.stdin, 'isTTY', stdinTty);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (stdoutTty) Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
});
async function run(failure?: unknown) {
  const { runTui, unsilenceTerminal } = await import('../src/run-tui.js');
  restoreTerminal = unsilenceTerminal;
  boundary.render.mockReturnValue({
    unmount: () => {},
    waitUntilExit: () => (failure === undefined ? Promise.resolve() : Promise.reject(failure)),
  });
  return runTui({
    agent: {
      ctx: { meta: {}, agentId: 'proof', provider: {}, session: { close: async () => {} } },
    },
    events: {},
    attachments: {},
    slashRegistry: {},
    model: 'proof',
    titleAnimation: false,
    statuslineHiddenItems: [],
    setStatuslineHiddenItems: () => {},
    saveStatuslineHiddenItems: async () => {},
  } as never);
}
describe('async TUI runtime error diagnostics', () => {
  it('CONTROL: clean exit restores the terminal without an error diagnostic', async () => {
    expect(await run()).toBe(0);
    expect(writes.some((w) => w.stream === 'out' && w.text.includes('\x1b[?1049l'))).toBe(true);
    expect(
      writes
        .filter((w) => w.stream === 'err')
        .map((w) => w.text)
        .join(''),
    ).not.toContain('TUI render failed');
  });
  it('reports an Ink runtime rejection on the shell after restoring the terminal', async () => {
    const failure = new Error('async-render-proof');
    expect(await run(failure)).toBe(1);
    const reset = writes.findIndex((w) => w.stream === 'out' && w.text.includes('\x1b[?1049l'));
    const error = writes.findIndex(
      (w) => w.stream === 'err' && w.text.includes('async-render-proof'),
    );
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(
      error,
      'TUI runtime failure was swallowed instead of reported after alternate-screen cleanup',
    ).toBeGreaterThan(reset);
  });
});

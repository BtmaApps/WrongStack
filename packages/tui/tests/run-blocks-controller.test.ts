/**
 * Run-blocks controller — stale-epilogue dispatch contract.
 *
 * Regression (bug-hunt round 2026-09-17-r27, red→green): the post-run
 * epilogue (onSDDOutput / predictNext) contains awaits but had no
 * session-generation re-check afterwards, while every other continuation is
 * guarded (post-run return, catch, queue drain). The TUI /clear path
 * (submit-controller) bumps sessionGeneration and dispatches clearHistory
 * WITHOUT waiting for idle, so a /clear landing while the epilogue was
 * parked on the predictNext LLM round-trip appended stale entries (SDD
 * notices, "↳ likely next:" summaries) into the freshly cleared transcript
 * and fired onRunFinished('done') for a wiped session. The epilogue now
 * bails on a stale generation after each await; lifecycle cleanup still runs
 * through finally.
 */
import { describe, expect, it, vi } from 'vitest';
import { createRunBlocksController } from '../src/run-blocks-controller.js';

function makeControlledHost(opts: { predictDelayMs?: number } = {}) {
  const dispatch = vi.fn();
  const refs = {
    sessionGeneration: { current: 1 },
    activeRunGeneration: { current: 0 },
    activeRunSettled: { current: Promise.resolve() },
    activeController: { current: null as AbortController | null },
    interrupts: { current: 0 },
    assistantCommitted: { current: false },
    streamingText: { current: '' },
    streamSegments: { current: [] as unknown[] },
    pendingDelta: { current: '' },
    flushTimer: { current: null as ReturnType<typeof setTimeout> | null },
    chime: { current: false },
    state: { current: { queue: [] as unknown[] } },
  };
  const capabilities = {
    agent: {
      ctx: {
        meta: {} as Record<string, unknown>,
        provider: { id: 'fake', capabilities: { vision: false } },
        model: 'fake-model',
      },
      run: vi.fn(async () => ({
        status: 'done',
        finalText: 'assistant final answer',
        iterations: 1,
      })),
    },
    predictNext: vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          setTimeout(() => resolve(['one', 'two']), opts.predictDelayMs ?? 50);
        }),
    ),
    onRunFinished: vi.fn(),
  };
  const host = {
    capabilities: capabilities as never,
    refs,
    dispatch,
  };
  const runBlocks = createRunBlocksController(host as never);
  return { runBlocks, dispatch, refs, capabilities };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const addEntryCalls = (dispatch: ReturnType<typeof vi.fn>): number =>
  dispatch.mock.calls.filter(([action]) => (action as { type: string }).type === 'addEntry').length;

describe('RunBlocks stale-epilogue contract', () => {
  it('CONTROL — an undisturbed epilogue renders predictions and finishes the run', async () => {
    const { runBlocks, dispatch, refs, capabilities } = makeControlledHost();
    await runBlocks([{ type: 'text', text: 'hello' } as never]);
    expect(capabilities.predictNext).toHaveBeenCalledTimes(1);
    const predictionEntry = dispatch.mock.calls.some(
      ([action]) =>
        (action as { type: string }).type === 'addEntry' &&
        String((action as { entry?: { text?: string } }).entry?.text).startsWith('↳ likely next:'),
    );
    expect(predictionEntry).toBe(true);
    expect(capabilities.onRunFinished).toHaveBeenCalledWith('done');
    expect(refs.activeController.current).toBeNull();
  }, 15000);

  it('/clear (generation bump) during the predictNext await must not dispatch into the cleared transcript', async () => {
    const { runBlocks, dispatch, refs, capabilities } = makeControlledHost({
      predictDelayMs: 300,
    });
    const run = runBlocks([{ type: 'text', text: 'hello' } as never]);
    await wait(50); // runBlocks is parked on the predictNext LLM round-trip
    expect(capabilities.predictNext).toHaveBeenCalledTimes(1);
    const addEntriesBeforeClear = addEntryCalls(dispatch);
    const finishedCallsBeforeClear = capabilities.onRunFinished.mock.calls.length;

    // The /clear sequence (submit-controller): bump generation, dispatch
    // clearHistory — no waitForIdle before the reset.
    refs.sessionGeneration.current += 1;

    await run; // parked epilogue resolves at ~300ms, AFTER the bump

    // Pre-fix: the stale epilogue appended its prediction summary into the
    // freshly cleared transcript and reported 'done' for the wiped session.
    expect(addEntryCalls(dispatch)).toBe(addEntriesBeforeClear);
    expect(capabilities.onRunFinished.mock.calls.length).toBe(finishedCallsBeforeClear);
    // Lifecycle cleanup must still happen via finally.
    expect(refs.activeController.current).toBeNull();
  }, 15000);
});

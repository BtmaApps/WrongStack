import {
  buildAutoWakePrompt,
  delegationDeliveryId,
  type LeaderDelivery,
  LeaderAutoWakeController,
  LeaderDeliveryHub,
} from '@wrongstack/core/coordination';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTuiLeaderWakePort } from '../src/hooks/use-leader-auto-wake.js';
import { createRunBlocksController, type RunBlocksRefs } from '../src/run-blocks-controller.js';

/**
 * TUI host side of background-delegation auto-wake: the foreground wake port
 * over the real run controller and a real LeaderAutoWakeController.
 */

const SID = 'tui-session';

type QueueItem = { displayText: string; blocks: unknown[] };

function delivery(id: string, wake = true): LeaderDelivery {
  return {
    deliveryId: delegationDeliveryId(id),
    sessionId: SID,
    kind: 'delegation_result',
    createdAt: Date.now(),
    wake,
    payload: { delegationId: id, target: 'helper', task: 't', ok: true, handoffs: 0, summary: 's' },
  };
}

const controllers: LeaderAutoWakeController[] = [];
afterEach(() => {
  for (const c of controllers.splice(0)) c.dispose();
});

function setup(opts: { queue?: QueueItem[]; runImpl?: (input: unknown) => Promise<unknown> } = {}) {
  const hub = new LeaderDeliveryHub();
  const controller = new LeaderAutoWakeController({
    hub,
    config: () => ({ autoWakeDebounceMs: 0 }),
  });
  controllers.push(controller);
  const refs = {
    sessionGeneration: { current: 1 },
    activeRunGeneration: { current: 0 },
    activeRunSettled: { current: Promise.resolve() },
    activeController: { current: null as AbortController | null },
    interrupts: { current: 0 },
    assistantCommitted: { current: false },
    streamingText: { current: '' },
    streamSegments: { current: [] },
    pendingDelta: { current: '' },
    flushTimer: { current: null },
    chime: { current: false },
    state: { current: { queue: opts.queue ?? [], confirmQueue: [] as unknown[] } as never },
  } as unknown as RunBlocksRefs;
  const run = vi.fn(opts.runImpl ?? (async () => ({ status: 'done', iterations: 1 })));
  const entries: Array<{ kind: string; text: string }> = [];
  const dispatch = vi.fn((action: { type: string; entry?: { kind: string; text: string } }) => {
    if (action.type === 'dequeueFirst') {
      const state = refs.state.current as unknown as { queue: QueueItem[] };
      refs.state.current = { ...state, queue: state.queue.slice(1) } as never;
    }
    if (action.type === 'addEntry' && action.entry) entries.push(action.entry);
  });
  const runBlocksCell = { current: null as never as ReturnType<typeof createRunBlocksController> };
  const runBlocks = createRunBlocksController({
    capabilities: {
      agent: {
        run,
        ctx: {
          provider: { id: 'p', capabilities: { vision: false } },
          model: 'm',
          meta: {},
          session: { id: SID },
        },
      } as never,
      visionAdapters: [],
      onUserRun: () => controller.noteUserInput(SID),
      onIdleAfterRun: () => {
        controller.onRunFinished(SID);
      },
    },
    refs,
    dispatch: dispatch as never,
  });
  runBlocksCell.current = runBlocks;
  const pendingForms = { current: 0 };
  const port = createTuiLeaderWakePort({
    getSessionId: () => SID,
    activeController: refs.activeController,
    eternalLoopRunning: { current: false },
    parallelLoopRunning: { current: false },
    state: refs.state as never,
    pendingForms,
    runBlocks: runBlocksCell,
  });
  controller.attachPort(port);
  return { hub, controller, refs, run, runBlocks, port, pendingForms, entries };
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('TUI leader wake port', () => {
  it('idle → a wake-eligible result starts a turn with the auto-wake prompt (not a user run)', async () => {
    const { hub, run } = setup();
    hub.enqueue(delivery('d1'));
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toEqual([{ type: 'text', text: buildAutoWakePrompt(['d1']) }]);
  });

  it('running → no wake (and nothing is queued)', async () => {
    const { hub, run, refs, port } = setup();
    refs.activeController.current = new AbortController();
    hub.enqueue(delivery('d1'));
    await flush();
    expect(port.isIdle(SID)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect((refs.state.current as unknown as { queue: unknown[] }).queue).toHaveLength(0);
  });

  it('queued user input → no wake', async () => {
    const { hub, run, port } = setup({ queue: [{ displayText: 'q', blocks: [] }] });
    hub.enqueue(delivery('d1'));
    await flush();
    expect(port.isIdle(SID)).toBe(false);
    expect(port.hasPendingUserInput(SID)).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('post-run check wakes for a result that arrived during the last iteration', async () => {
    const holder: { hub?: LeaderDeliveryHub } = {};
    let calls = 0;
    const ctx = setup({
      runImpl: async () => {
        calls += 1;
        // Lands while the user's turn is still running: the debounce-time
        // evaluation sees a busy leader; only the post-run check can wake.
        if (calls === 1) holder.hub!.enqueue(delivery('late'));
        return { status: 'done', iterations: 1 };
      },
    });
    holder.hub = ctx.hub;
    await ctx.runBlocks([{ type: 'text', text: 'user turn' }] as never);
    await flush();
    expect(ctx.run).toHaveBeenCalledTimes(2);
    expect(ctx.run.mock.calls[1]![0]).toEqual([
      { type: 'text', text: buildAutoWakePrompt(['late']) },
    ]);
  });

  it('confirm pending → hold; wakes from the post-run check once it clears', async () => {
    const { hub, run, refs, controller, port, pendingForms } = setup();
    (refs.state.current as unknown as { confirmQueue: unknown[] }).confirmQueue = [{}];
    hub.enqueue(delivery('d1'));
    await flush();
    expect(port.isConfirmPending(SID)).toBe(true);
    expect(run).not.toHaveBeenCalled();

    (refs.state.current as unknown as { confirmQueue: unknown[] }).confirmQueue = [];
    pendingForms.current = 1;
    expect(controller.onRunFinished(SID)).toBe('busy');
    pendingForms.current = 0;
    expect(controller.onRunFinished(SID)).toBe('woken');
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a wake:false result never starts a turn, even after a run', async () => {
    const { hub, run, runBlocks } = setup();
    hub.enqueue(delivery('stopped', false));
    await flush();
    await runBlocks([{ type: 'text', text: 'hi' }] as never);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('only the foreground session is open/displayed', () => {
    const { port } = setup();
    expect(port.isOpen(SID)).toBe(true);
    expect(port.isDisplayed(SID)).toBe(true);
    expect(port.isDisplayed('another')).toBe(false);
  });
});

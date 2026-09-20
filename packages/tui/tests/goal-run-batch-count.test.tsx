import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { reducer } from '../src/app-reducer.js';
import type { State } from '../src/app-state.js';
import { useTuiEventBridge } from '../src/hooks/use-tui-event-bridge.js';

/**
 * PhaseOrchestrator.executePhaseTasks settles each concurrency batch in a
 * synchronous for-loop (markTaskCompleted per fulfilled task), so several
 * `phase.taskCompleted` events reach the TUI goal handler in one tick with no
 * render between them. The completed-tasks arithmetic must therefore live in
 * the reducer (which applies every action against its own latest state), not
 * in the handler reading the render-synced stateRef.
 */
type GoalHandler = (event: string, payload: unknown) => void;

interface Captured {
  handler?: GoalHandler | undefined;
  stateRef?: { current: State } | undefined;
}

function stubEventBus(): unknown {
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  return {
    on(event: string, cb: (p: unknown) => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(cb);
      return () => {
        set?.delete(cb);
      };
    },
    onPattern(_pattern: unknown, _cb: unknown) {
      return () => {};
    },
  };
}

const baseState = { fleetChat: 'full' } as unknown as State;

async function until(cond: () => boolean, what: string, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function mountBridge(captured: Captured) {
  function Harness() {
    const [state, dispatch] = React.useReducer(reducer, baseState);
    const stateRef = React.useRef(state);
    stateRef.current = state;
    useTuiEventBridge({
      events: stubEventBus() as never,
      dispatch,
      stateRef,
      setActiveMaxContext: () => {},
      getSessionId: () => 'sess-goalrun-count',
      subscribeGoal: (h) => {
        captured.handler = h;
        captured.stateRef = stateRef;
        return () => {};
      },
    });
    return null;
  }
  return render(React.createElement(Harness));
}

function phaseView(captured: Captured) {
  return captured.stateRef?.current.goalRun?.phases['p1'];
}

describe('goal run task counting', () => {
  it('counts every taskCompleted in a same-tick settlement batch', async () => {
    const captured: Captured = {};
    const view = mountBridge(captured);
    try {
      await until(() => captured.handler !== undefined, 'subscribeGoal handler captured');
      const h = captured.handler as GoalHandler;

      h('phase.started', { phaseId: 'p1', name: 'Alpha' });
      await until(() => phaseView(captured) !== undefined, 'phase p1 registered');

      h('phase.taskStarted', { phaseId: 'p1', taskId: 't1', taskTitle: 'T1' });
      h('phase.taskStarted', { phaseId: 'p1', taskId: 't2', taskTitle: 'T2' });
      await until(() => (phaseView(captured)?.activeTasks ?? []).length === 2, 'both tasks active');

      // Same-tick pair, exactly as the orchestrator's allSettled loop emits
      // them (DEFAULT_TASK_CONCURRENCY = 2).
      h('phase.taskCompleted', { phaseId: 'p1', taskId: 't1', taskTitle: 'T1' });
      h('phase.taskCompleted', { phaseId: 'p1', taskId: 't2', taskTitle: 'T2' });

      // Witness that BOTH events were fully processed (both tasks left the
      // active list) before asserting the counter.
      await until(
        () => (phaseView(captured)?.activeTasks ?? []).length === 0,
        'both completions processed',
      );

      expect(phaseView(captured)?.completedTasks).toBe(2);
    } finally {
      view.unmount();
    }
  });

  it('control: render-separated completions still count one each', async () => {
    const captured: Captured = {};
    const view = mountBridge(captured);
    try {
      await until(() => captured.handler !== undefined, 'subscribeGoal handler captured');
      const h = captured.handler as GoalHandler;

      h('phase.started', { phaseId: 'p1', name: 'Alpha' });
      await until(() => phaseView(captured) !== undefined, 'phase p1 registered');

      h('phase.taskStarted', { phaseId: 'p1', taskId: 't1', taskTitle: 'T1' });
      h('phase.taskStarted', { phaseId: 'p1', taskId: 't2', taskTitle: 'T2' });
      await until(() => (phaseView(captured)?.activeTasks ?? []).length === 2, 'both tasks active');

      h('phase.taskCompleted', { phaseId: 'p1', taskId: 't1', taskTitle: 'T1' });
      await until(
        () => phaseView(captured)?.completedTasks === 1,
        'first render-separated completion counted',
      );

      h('phase.taskCompleted', { phaseId: 'p1', taskId: 't2', taskTitle: 'T2' });
      await until(
        () => (phaseView(captured)?.activeTasks ?? []).length === 0,
        'second completion processed',
      );

      expect(phaseView(captured)?.completedTasks).toBe(2);
    } finally {
      view.unmount();
    }
  });

  it('reducer counts sequential goalRunTaskCompleted actions against latest state', () => {
    let s = reducer(baseState, { type: 'goalRunInit', title: 'T' });
    s = reducer(s, {
      type: 'goalRunPhaseUpdate',
      phaseId: 'p1',
      name: 'Alpha',
      status: 'running',
      completedTasks: 0,
      totalTasks: 0,
    });
    s = reducer(s, {
      type: 'goalRunTaskActive',
      phaseId: 'p1',
      taskId: 't1',
      title: 'T1',
      active: true,
    });
    s = reducer(s, {
      type: 'goalRunTaskActive',
      phaseId: 'p1',
      taskId: 't2',
      title: 'T2',
      active: true,
    });
    s = reducer(s, { type: 'goalRunTaskCompleted', phaseId: 'p1', taskId: 't1' });
    s = reducer(s, { type: 'goalRunTaskCompleted', phaseId: 'p1', taskId: 't2' });
    const phase = s.goalRun?.phases['p1'];
    expect(phase?.completedTasks).toBe(2);
    expect(phase?.activeTasks ?? []).toHaveLength(0);
  });

  it('ignores goalRunTaskCompleted for an unknown phase', () => {
    const s = reducer(baseState, { type: 'goalRunInit', title: 'T' });
    const next = reducer(s, { type: 'goalRunTaskCompleted', phaseId: 'nope', taskId: 't1' });
    expect(next).toBe(s);
  });
});

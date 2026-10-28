import { describe, expect, it } from 'vitest';
import {
  reduceStreamActivity,
  startStreamActivity,
  streamActivityView,
} from '../src/types/stream-activity.js';

describe('received model output activity', () => {
  it('estimates a canonical non-streamed answer when usage is unavailable', () => {
    let state = reduceStreamActivity(null, { type: 'iteration.started' }, 1000);
    state = reduceStreamActivity(
      state,
      { type: 'provider.response', payload: { content: [{ type: 'text', text: 'hello world!' }] } },
      2000,
    );
    expect(streamActivityView(state!, 2000)).toMatchObject({
      tokens: 3,
      estimated: true,
      speedLabel: '— tok/s',
    });
  });

  it('counts output a provider reported without streaming it, then settles on exact usage', () => {
    let state = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    state = reduceStreamActivity(
      state,
      { type: 'provider.output_progress', payload: { tokens: 200, durationMs: 2000 } },
      2000,
    );
    const live = streamActivityView(state!, 2000);
    expect(live.tokens).toBe(200);
    expect(live.estimated).toBe(false);
    // 200 tokens over the 2 s the step took, not one spike when it landed.
    expect(Math.round(live.tokensPerSecond)).toBe(100);
    expect(live.speedLabel).toBe('≈100 tok/s');
    state = reduceStreamActivity(
      state,
      { type: 'provider.response', payload: { usage: { output: 230 } } },
      2500,
    );
    expect(streamActivityView(state!, 2500)).toMatchObject({ tokens: 230, estimated: false });
  });

  it('keeps the generation rate of tool-call steps through long steps and quiet gaps', () => {
    let state = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    state = reduceStreamActivity(
      state,
      { type: 'provider.output_progress', payload: { tokens: 150, durationMs: 2000 } },
      2000,
    );
    // The next step writes a long tool call for 36 s and reports nothing until
    // it lands: the meter keeps the measured rate instead of dropping to 0.
    expect(streamActivityView(state!, 20_000).speedLabel).toBe('≈75 tok/s');
    state = reduceStreamActivity(
      state,
      { type: 'provider.output_progress', payload: { tokens: 3450, durationMs: 36_000 } },
      38_000,
    );
    // 3600 tokens over 38 s of generation, not a spike when the step lands.
    expect(streamActivityView(state!, 38_000).speedLabel).toBe('≈95 tok/s');
    expect(streamActivityView(state!, 45_000).tokens).toBe(3600);
    // Streamed text, while it flows, shows its own live rate.
    state = reduceStreamActivity(
      state,
      { type: 'provider.text_delta', payload: { text: 'a'.repeat(400) } },
      46_000,
    );
    expect(streamActivityView(state!, 46_000).speedLabel).toBe('≈25 tok/s');
  });

  it('ignores an empty or invalid output report', () => {
    const state = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    for (const tokens of [0, -5, Number.NaN, '12']) {
      expect(
        reduceStreamActivity(state, { type: 'provider.output_progress', payload: { tokens } }, 10),
      ).toBe(state);
    }
  });

  it('reconciles a run that ended while the socket was disconnected', () => {
    let state = reduceStreamActivity(
      null,
      { type: 'provider.text_delta', payload: { text: 'abcd' } },
      1000,
    );
    state = reduceStreamActivity(
      state,
      { type: 'session.run_state', payload: { isRunning: false } },
      2000,
    );
    expect(streamActivityView(state!, 3000)).toMatchObject({
      tokens: 1,
      receiving: false,
      elapsedLabel: '1s',
    });
    state = reduceStreamActivity(
      state,
      { type: 'session.run_state', payload: { isRunning: true } },
      4000,
    );
    expect(streamActivityView(state!, 4000)).toMatchObject({
      tokens: 0,
      phaseLabel: 'Waiting for model',
    });
  });
  it('waits honestly before the first chunk', () => {
    const view = streamActivityView(startStreamActivity(100), 2100);
    expect(view).toMatchObject({
      tokens: 0,
      tokensPerSecond: 0,
      receiving: false,
      speedLabel: '— tok/s',
      elapsedLabel: '2s',
      phaseLabel: 'Waiting for model',
    });
  });

  it('counts thinking and text without counting tool output', () => {
    let state = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    state = reduceStreamActivity(
      state,
      { type: 'provider.thinking_delta', payload: { text: 'a'.repeat(40) } },
      1000,
    );
    state = reduceStreamActivity(
      state,
      { type: 'provider.text_delta', payload: { text: 'b'.repeat(80) } },
      2000,
    );
    state = reduceStreamActivity(
      state,
      { type: 'tool.progress', payload: { text: 'c'.repeat(4000) } },
      2000,
    );
    expect(streamActivityView(state!, 2000)).toMatchObject({
      tokens: 30,
      estimated: true,
      tokensPerSecond: 30,
      receiving: true,
    });
    expect(state?.receivedChars).toBe(120);
  });

  it('reconciles completed calls against provider usage without double counting', () => {
    let state = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    state = reduceStreamActivity(
      state,
      { type: 'provider.text_delta', payload: { text: 'a'.repeat(100) } },
      1000,
    );
    const response = { type: 'provider.response', payload: { usage: { output: 18 } } };
    state = reduceStreamActivity(state, response, 2000);
    state = reduceStreamActivity(state, response, 2100);
    expect(streamActivityView(state!, 2100)).toMatchObject({
      tokens: 18,
      estimated: false,
      countLabel: '18 tokens',
    });
    state = reduceStreamActivity(state, { type: 'iteration.started' }, 3000);
    state = reduceStreamActivity(
      state,
      { type: 'provider.text_delta', payload: { text: 'b'.repeat(40) } },
      4000,
    );
    expect(streamActivityView(state!, 4000)).toMatchObject({ tokens: 28, estimated: true });
    state = reduceStreamActivity(
      state,
      { type: 'provider.response', payload: { usage: { output: 12 } } },
      5000,
    );
    expect(streamActivityView(state!, 5000)).toMatchObject({ tokens: 30, estimated: false });
  });

  it.each([undefined, NaN, Infinity, -1, 0, 1.5])(
    'keeps estimates when output usage is invalid: %s',
    (output) => {
      let state = reduceStreamActivity(
        null,
        { type: 'provider.text_delta', payload: { text: 'hello world!' } },
        1000,
      );
      state = reduceStreamActivity(
        state,
        { type: 'provider.response', payload: { usage: { output } } },
        2000,
      );
      expect(streamActivityView(state!, 2000)).toMatchObject({ tokens: 3, estimated: true });
    },
  );

  it('records a non-streamed tool-only response and valid zero usage', () => {
    let state = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    state = reduceStreamActivity(
      state,
      { type: 'provider.response', payload: { usage: { output: 23 } } },
      1000,
    );
    state = reduceStreamActivity(state, { type: 'iteration.started' }, 2000);
    state = reduceStreamActivity(
      state,
      { type: 'provider.response', payload: { usage: { output: 0 } } },
      3000,
    );
    expect(streamActivityView(state!, 3000)).toMatchObject({ tokens: 23, estimated: false });
  });

  it('drops to zero speed on a stalled stream without inventing tokens', () => {
    const state = reduceStreamActivity(
      null,
      { type: 'provider.text_delta', payload: { text: 'a'.repeat(400) } },
      1000,
    )!;
    expect(streamActivityView(state, 2000).tokensPerSecond).toBeGreaterThan(0);
    expect(streamActivityView(state, 6000)).toMatchObject({
      tokens: 100,
      tokensPerSecond: 0,
      receiving: false,
      phaseLabel: 'Working',
    });
  });

  it('keeps a bounded rolling window through long responses', () => {
    let state = startStreamActivity(0);
    for (let at = 0; at < 100_000; at += 10) {
      state = reduceStreamActivity(
        state,
        { type: 'provider.text_delta', payload: { text: 'abcd' } },
        at,
      )!;
    }
    expect(state.samples.length).toBeLessThanOrEqual(17);
    expect(streamActivityView(state, 100_000).tokens).toBe(10_000);
  });

  it('freezes on completion and resets on the next run or session', () => {
    let state = reduceStreamActivity(
      null,
      { type: 'provider.text_delta', payload: { text: 'abcd' } },
      1000,
    );
    state = reduceStreamActivity(state, { type: 'run.result' }, 2000);
    expect(streamActivityView(state!, 2000)).toEqual(streamActivityView(state!, 90_000));
    state = reduceStreamActivity(state, { type: 'iteration.started' }, 100_000);
    expect(streamActivityView(state!, 100_000).tokens).toBe(0);
    expect(reduceStreamActivity(state, { type: 'session.start' }, 101_000)).toBeNull();
  });

  it('ignores empty chunks and side-request errors, but stops on terminal errors', () => {
    const state = startStreamActivity(1000);
    expect(
      reduceStreamActivity(state, { type: 'provider.text_delta', payload: { text: '' } }, 2000),
    ).toBe(state);
    expect(
      reduceStreamActivity(state, { type: 'error', payload: { phase: 'files.read' } }, 2000),
    ).toBe(state);
    expect(
      reduceStreamActivity(state, { type: 'error', payload: { phase: 'agent.run' } }, 2000)
        ?.endedAt,
    ).toBe(2000);
  });

  it('preserves exact tokens from provider.output_progress when provider.response has missing or zero output usage (F782)', () => {
    let s1 = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    s1 = reduceStreamActivity(
      s1,
      { type: 'provider.output_progress', payload: { tokens: 200, durationMs: 2000 } },
      2000,
    );
    s1 = reduceStreamActivity(
      s1,
      { type: 'provider.response', payload: { usage: { output: 0 } } },
      2500,
    );
    expect(streamActivityView(s1!, 2500)).toMatchObject({ tokens: 200, estimated: false });

    let s2 = reduceStreamActivity(null, { type: 'iteration.started' }, 0);
    s2 = reduceStreamActivity(
      s2,
      { type: 'provider.output_progress', payload: { tokens: 150, durationMs: 1500 } },
      1500,
    );
    s2 = reduceStreamActivity(s2, { type: 'provider.response', payload: {} }, 2000);
    expect(streamActivityView(s2!, 2000)).toMatchObject({ tokens: 150, estimated: false });
  });
});

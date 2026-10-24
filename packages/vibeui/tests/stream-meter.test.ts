// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StreamMeter } from '../src/components/stream-meter';
import { initialState, reduceFrame } from '../src/lib/session';

describe('VibeUI model activity', () => {
  it('measures the production reducer stream and reconciles provider usage', () => {
    let state = { ...initialState(), id: 'one' };
    state = reduceFrame(state, {
      type: 'iteration.started',
      payload: { sessionId: 'one', index: 1 },
    });
    expect(state.running).toBe(true);
    expect(
      renderToStaticMarkup(
        createElement(StreamMeter, { activity: state.streamActivity, running: state.running }),
      ),
    ).toContain('Waiting for model');
    state = reduceFrame(state, {
      type: 'provider.thinking_delta',
      payload: { sessionId: 'one', text: 'a'.repeat(80) },
    });
    expect(state.streamActivity?.receivedChars).toBe(80);
    const foreign = reduceFrame(state, {
      type: 'provider.text_delta',
      payload: { sessionId: 'two', text: 'wrong' },
    });
    expect(foreign).toBe(state);
    state = reduceFrame(state, {
      type: 'provider.response',
      payload: {
        sessionId: 'one',
        usage: { output: 19 },
        content: [{ type: 'text', text: 'Done' }],
        stopReason: 'end_turn',
      },
    });
    state = reduceFrame(state, {
      type: 'run.result',
      payload: { sessionId: 'one', status: 'done' },
    });
    const html = renderToStaticMarkup(
      createElement(StreamMeter, { activity: state.streamActivity, running: state.running }),
    );
    expect(html).toContain('19 tokens');
    expect(html).toContain('tok/s');
    expect(html).toContain('Finished');
    expect(html).toContain('data-active="false"');
  });

  it('keeps the meter empty after a session switch', () => {
    let state = reduceFrame(initialState(), {
      type: 'provider.text_delta',
      payload: { text: 'streaming' },
    });
    state = reduceFrame(state, {
      type: 'session.start',
      payload: { sessionId: 'next', provider: 'fixture', model: 'model' },
    });
    expect(state.streamActivity).toBeNull();
  });
});

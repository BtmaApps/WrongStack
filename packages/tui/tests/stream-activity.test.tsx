import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { State } from '../src/app-state.js';
import { StreamActivityLine } from '../src/components/stream-activity-line.js';
import { reduceConversation } from '../src/reducers/conversation.js';
import { displayWidth } from '../src/terminal-width.js';

describe('TUI model activity', () => {
  it('counts deltas independently of retained display text and preserves a completed call through streamReset', () => {
    let state = {
      status: 'idle',
      streamingText: '',
      runningTools: new Map(),
      toolStream: null,
    } as State;
    state = reduceConversation(state, { type: 'status', status: 'running' });
    state = reduceConversation(state, { type: 'streamDelta', delta: 'x'.repeat(100_000) });
    expect(state.streamingText.length).toBeLessThan(100_000);
    expect(state.streamActivity?.receivedChars).toBe(100_000);
    state = reduceConversation(state, {
      type: 'streamActivityFrame',
      frame: { type: 'provider.response', payload: { usage: { output: 21_000 } } },
    });
    state = reduceConversation(state, { type: 'streamReset' });
    state = reduceConversation(state, { type: 'status', status: 'idle' });
    const view = render(
      <StreamActivityLine activity={state.streamActivity} width={80} running={false} />,
    );
    expect(view.lastFrame()).toContain('21,000 tokens');
    expect(view.lastFrame()).toContain('tok/s');
    expect(view.lastFrame()).toContain('Finished');
    view.unmount();
    const narrow = render(
      <StreamActivityLine activity={state.streamActivity} width={35} running={false} />,
    );
    expect(displayWidth(narrow.lastFrame() ?? '')).toBeLessThanOrEqual(35);
    expect(narrow.lastFrame()).toContain('21,000 tokens');
    narrow.unmount();
    state = reduceConversation(state, { type: 'status', status: 'running' });
    expect(state.streamActivity?.receivedChars).toBe(0);
  });
});

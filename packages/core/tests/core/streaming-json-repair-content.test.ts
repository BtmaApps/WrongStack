import { describe, expect, it } from 'vitest';
import {
  buildResponse,
  createStreamingState,
  handleToolUseInputDelta,
  handleToolUseStart,
  handleToolUseStop,
} from '../../src/core/streaming-response-builder.js';

function streamedToolInput(raw: string): unknown {
  const state = createStreamingState('test-model');
  handleToolUseStart(state, { id: 'edit-input', name: 'edit' });
  handleToolUseInputDelta(state, { id: 'edit-input', partial: raw });
  handleToolUseStop(state, { id: 'edit-input' });
  const block = buildResponse(state).content.find((entry) => entry.type === 'tool_use');
  expect(block?.type).toBe('tool_use');
  return block?.type === 'tool_use' ? block.input : undefined;
}

describe('streamed tool arguments preserve complete string content', () => {
  const original = {
    path: 'fixture.txt',
    old_string: 'keep ,} and :} exactly',
    new_string: 'replacement',
  };

  it('preserves valid arguments without repair', () => {
    expect(streamedToolInput(JSON.stringify(original))).toEqual(original);
  });

  it('repairs a missing value without changing the edit search string', () => {
    const raw = `${JSON.stringify(original).slice(0, -1)},"optional":}`;
    expect(streamedToolInput(raw)).toEqual({ ...original, optional: null });
  });
});

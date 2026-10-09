// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { handleRefineResultMessage } from '../src/lib/message-handler-catalog.js';

const IMAGE = { data: 'data:image/png;base64,AAAA', mime: 'image/png' };

function run(refined: string, images?: (typeof IMAGE)[]) {
  const sent: unknown[][] = [];
  const state = {
    original: 'describe this',
    refined: '',
    english: '',
    status: 'refining',
    epoch: 1,
    ...(images ? { images } : {}),
  };
  const deps = {
    refineStateRef: { current: state },
    refineEpochRef: { current: 1 },
    socketRef: { current: null },
    setRefineState: () => undefined,
    dispatchUserMessage: (...args: unknown[]) => {
      sent.push(args);
      return true;
    },
  };
  handleRefineResultMessage(
    { type: 'model.refine_result', payload: { refined } } as never,
    deps as never,
  );
  return sent;
}

describe('model.refine_result auto-send of an unchanged refinement', () => {
  it('forwards the images attached to the original message', () => {
    const sent = run('describe this', [IMAGE]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(['describe this', [{ ...IMAGE, mediaType: 'image/png' }]]);
  });

  it('sends text only when nothing was attached', () => {
    expect(run('', undefined)).toEqual([['describe this']]);
    expect(run('describe this', [])).toEqual([['describe this']]);
  });

  it('does not dispatch when the refinement changed (the panel opens instead)', () => {
    expect(run('Describe this image in detail.', [IMAGE])).toHaveLength(0);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onPresentArtifact } from '../src/lib/artifact-presentation.js';
import { createMessageHandler } from '../src/lib/message-handler.js';
import type { MessageHandlerDeps } from '../src/lib/message-handler-deps.js';

const listeners: Array<() => void> = [];
afterEach(() => {
  for (const off of listeners.splice(0)) off();
});
describe('SimpleUI artifact routing', () => {
  it.each([
    ['s', 's', true, 1],
    ['other', 'other', true, 0],
    ['s', 'other', true, 0],
    ['s', 's', false, 0],
  ])('routes only a successful current-session descriptor', (frameSession, owner, ok, count) => {
    const received = vi.fn();
    listeners.push(onPresentArtifact(received));
    const handler = createMessageHandler({
      sessionIdRef: { current: 's' },
      setActivity: vi.fn(),
      setToolCalls: vi.fn(),
      worklists: { applyMessage: vi.fn() },
    } as unknown as MessageHandlerDeps);
    handler({
      type: 'tool.executed',
      payload: {
        sessionId: frameSession,
        id: 'tool-a',
        name: 'present_artifact',
        ok,
        output: JSON.stringify({
          type: 'artifact.presentation',
          version: 1,
          id: 'artifact-a',
          sessionId: owner,
          path: 'report.md',
          title: 'Report',
        }),
      },
    });
    expect(received).toHaveBeenCalledTimes(count);
  });
});

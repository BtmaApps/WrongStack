// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactPreview } from '../../../simpleui/src/artifact-preview.js';
import { dispatchPresentArtifact } from '../../../simpleui/src/lib/artifact-presentation.js';
import type { SimpleSocket } from '../../../simpleui/src/lib/ws.js';

afterEach(() => cleanup());
describe('SimpleUI rich artifact lifecycle', () => {
  it('correlates image reads and retracts subscriptions when the owning session changes', () => {
    let receive!: (message: unknown) => void;
    const off = vi.fn();
    const send = vi.fn();
    const socket = {
      send,
      onMessage: (listener: (message: unknown) => void) => {
        receive = listener;
        return off;
      },
    } as unknown as SimpleSocket;
    const socketRef = { current: socket };
    const view = render(<ArtifactPreview socketRef={socketRef} sessionId="s" />);
    act(() =>
      dispatchPresentArtifact({
        type: 'artifact.presentation',
        version: 2,
        kind: 'image',
        id: 'a',
        sessionId: 's',
        path: 'image.png',
        title: 'Picture',
      }),
    );
    expect(send).toHaveBeenCalledWith('files.image', {
      filePath: 'image.png',
      sessionId: 's',
      requestId: 'rich:a',
    });
    act(() =>
      receive({
        type: 'files.image',
        payload: {
          filePath: 'image.png',
          sessionId: 'other',
          requestId: 'rich:a',
          dataUrl: 'data:image/png;base64,AA==',
        },
      }),
    );
    expect(screen.queryByRole('img')).toBeNull();
    view.rerender(<ArtifactPreview socketRef={socketRef} sessionId="other" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(off).toHaveBeenCalled();
  });
  it('stops live browser observation when the preview closes', () => {
    const send = vi.fn();
    const off = vi.fn();
    const socket = { send, onMessage: () => off } as unknown as SimpleSocket;
    const view = render(<ArtifactPreview socketRef={{ current: socket }} sessionId="s" />);
    act(() =>
      dispatchPresentArtifact({
        type: 'artifact.presentation',
        version: 2,
        kind: 'browser',
        browserSessionId: 'browser-a',
        id: 'b',
        sessionId: 's',
        path: 'browser',
        title: 'Browser',
      }),
    );
    expect(send).toHaveBeenCalledWith('browser.live.watch', { id: 'browser-a', sessionId: 's' });
    view.unmount();
    expect(send).toHaveBeenCalledWith('browser.live.unwatch', { sessionId: 's' });
    expect(off).toHaveBeenCalled();
  });
});

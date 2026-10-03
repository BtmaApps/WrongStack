import type { ArtifactPresentation } from '@wrongstack/tools/artifact-presentation';
import { parseUnifiedDiff } from '@wrongstack/tools/tool-diff';
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { onPresentArtifact } from './lib/artifact-presentation.js';
import { dispatchSimplePanel, onPanelActivation } from './lib/panel-events.js';
import { socketRequest } from './lib/socket-request.js';
import type { SimpleSocket } from './lib/ws.js';

export function ArtifactPreview({
  socketRef,
  sessionId,
}: {
  socketRef: { current: SimpleSocket | null };
  sessionId: string | null;
}) {
  const [artifact, setArtifact] = useState<ArtifactPresentation | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);
  useFocusTrap(dialog, artifact !== null);
  useEffect(() => {
    setArtifact(null);
    const seen = new Set<string>();
    const off = onPresentArtifact((item) => {
      if (
        item.sessionId !== sessionId ||
        !['image', 'diff', 'browser'].includes(item.kind ?? '') ||
        seen.has(item.id)
      )
        return;
      if (
        [...document.querySelectorAll('[aria-modal="true"]')].some(
          (element) => element !== dialog.current,
        )
      )
        return;
      seen.add(item.id);
      if (seen.size > 128) seen.delete(seen.values().next().value!);
      dispatchSimplePanel('open-artifact');
      setArtifact(item);
    });
    const offPanel = onPanelActivation((panel) => {
      if (panel !== 'open-artifact') setArtifact(null);
    });
    return () => {
      off();
      offPanel();
    };
  }, [sessionId]);
  useEffect(() => {
    setContent(null);
    setError('');
    const socket = socketRef.current;
    if (!artifact || artifact.sessionId !== sessionId || !socket) return;
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setArtifact(null);
      }
    };
    document.addEventListener('keydown', key);
    if (artifact.kind === 'browser') {
      const off = socket.onMessage((message) => {
        const payload = message.payload as Record<string, unknown>;
        if (payload?.['sessionId'] !== sessionId || payload?.['id'] !== artifact.browserSessionId)
          return;
        if (message.type === 'browser.live.frame' && typeof payload['data'] === 'string')
          setContent(`data:image/jpeg;base64,${payload['data']}`);
        if (message.type === 'browser.live.details' && payload['gone'])
          setError('Browser session closed.');
      });
      socket.send('browser.live.watch', { id: artifact.browserSessionId, sessionId });
      return () => {
        off();
        socket.send('browser.live.unwatch', { sessionId });
        document.removeEventListener('keydown', key);
      };
    }
    const type = artifact.kind === 'image' ? 'files.image' : 'files.read';
    const requestId = `rich:${artifact.id}`;
    const handle = socketRequest({
      socket,
      sendType: type,
      expectType: type,
      payload: { filePath: artifact.path, sessionId, requestId },
      accept: (frame) => {
        const payload = frame.payload as Record<string, unknown>;
        return (
          payload?.['sessionId'] === sessionId &&
          payload?.['requestId'] === requestId &&
          payload?.['filePath'] === artifact.path
        );
      },
    });
    let alive = true;
    void handle.promise.then((payload) => {
      if (!alive) return;
      const value = payload?.[artifact.kind === 'image' ? 'dataUrl' : 'content'];
      if (
        !payload ||
        payload['error'] ||
        payload['binary'] ||
        payload['tooLarge'] ||
        payload['notImage'] ||
        typeof value !== 'string'
      )
        setError(String(payload?.['error'] ?? 'Artifact preview unavailable.'));
      else setContent(value);
    });
    return () => {
      alive = false;
      handle.cancel();
      document.removeEventListener('keydown', key);
    };
  }, [artifact, sessionId, socketRef]);
  if (!artifact || artifact.sessionId !== sessionId) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: '#0008',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={artifact.title}
        style={{
          width: 'min(1000px, 95vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          background: 'var(--bg, #18181b)',
          color: 'var(--text, #fafafa)',
          padding: 20,
        }}
      >
        <header>
          <h2>{artifact.title}</h2>
          <button ref={close} type="button" onClick={() => setArtifact(null)}>
            Close preview
          </button>
        </header>
        <p>Read-only · {artifact.path}</p>
        {error ? (
          <p role="alert">{error}</p>
        ) : content === null ? (
          <p role="status">Loading preview…</p>
        ) : artifact.kind !== 'diff' ? (
          <img
            src={content}
            alt={artifact.title}
            style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }}
          />
        ) : (
          <pre>
            {parseUnifiedDiff(content)?.map((row, index) => (
              <div
                key={`${index}:${row.kind}`}
                style={{
                  color:
                    row.kind === 'add'
                      ? 'var(--success, #22c55e)'
                      : row.kind === 'del'
                        ? 'var(--danger, #ef4444)'
                        : undefined,
                }}
              >
                {row.text}
              </div>
            )) ?? 'Diff exceeds the preview limit. Open the saved file to inspect it.'}
          </pre>
        )}
      </section>
    </div>
  );
}

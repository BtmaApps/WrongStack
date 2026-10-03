import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  active: 's',
  view: 'chat',
  files: [] as Array<{ path: string; content: string; dirty: boolean }>,
  send: vi.fn(),
  openFile: vi.fn(),
  setActiveFile: vi.fn(),
  setError: vi.fn(),
  setCurrentView: vi.fn(),
}));
vi.mock('@/lib/ws-client', () => ({ getWSClient: () => ({ send: mock.send }) }));
vi.mock('@/lib/ws-client-utils', () => ({ foregroundSessionId: () => mock.active }));
vi.mock('@/stores', () => ({
  useFileStore: {
    getState: () => ({
      fileSessionId: 's',
      openFiles: mock.files,
      filesBySession: {},
      openFile: mock.openFile,
      setActiveFile: mock.setActiveFile,
      setError: mock.setError,
    }),
  },
  useUIStore: { getState: () => ({ currentView: mock.view, setCurrentView: mock.setCurrentView }) },
}));

import { consumeArtifactRead, presentArtifactResult } from '../../src/lib/artifact-presentation';

let id = 0;
function present(sessionId = 's') {
  const artifact = {
    type: 'artifact.presentation',
    version: 1,
    id: `a${++id}`,
    sessionId,
    path: 'docs/report.md',
    title: 'Report',
  };
  presentArtifactResult('present_artifact', true, JSON.stringify(artifact), sessionId);
  return artifact;
}
function respond(requestId: string, sessionId = 's') {
  return consumeArtifactRead({
    requestId,
    sessionId,
    filePath: 'docs/report.md',
    content: '# Report',
  });
}
beforeEach(() => {
  mock.active = 's';
  mock.view = 'chat';
  mock.files = [];
  for (const fn of [
    mock.send,
    mock.openFile,
    mock.setActiveFile,
    mock.setError,
    mock.setCurrentView,
  ])
    fn.mockClear();
});
describe('artifact presentation routing', () => {
  it('opens the correlated result in its owning foreground session', () => {
    const artifact = present();
    expect(mock.send).toHaveBeenCalledWith({
      type: 'files.read',
      payload: { filePath: artifact.path, sessionId: 's', requestId: `artifact:${artifact.id}` },
    });
    expect(respond(`artifact:${artifact.id}`)).toBe(true);
    expect(mock.openFile).toHaveBeenCalledWith(artifact.path, '# Report', 's');
    expect(mock.setCurrentView).toHaveBeenCalledWith('files');
  });
  it('does not steal the foreground for a background result', () => {
    present('other');
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('drops a late reply after the user switches sessions', () => {
    const artifact = present();
    mock.active = 'other';
    respond(`artifact:${artifact.id}`);
    expect(mock.openFile).not.toHaveBeenCalled();
    expect(mock.setCurrentView).not.toHaveBeenCalled();
  });
  it('preserves an editor opened and edited while its read was in flight', () => {
    const artifact = present();
    mock.files = [{ path: artifact.path, content: 'unsaved', dirty: true }];
    respond(`artifact:${artifact.id}`);
    expect(mock.openFile).not.toHaveBeenCalled();
    expect(mock.setActiveFile).toHaveBeenCalledWith(artifact.path, 's');
  });
  it('reveals an existing tab without re-reading or replacing its dirty contents', () => {
    mock.files = [{ path: 'docs/report.md', content: 'unsaved', dirty: true }];
    present();
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.openFile).not.toHaveBeenCalled();
  });
  it('keeps a panel the user deliberately opened', () => {
    mock.view = 'settings';
    present();
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.setCurrentView).not.toHaveBeenCalled();
  });
  it('ignores repeated execution events and unknown presentation replies', () => {
    const artifact = present();
    presentArtifactResult('present_artifact', true, artifact, 's');
    expect(mock.send).toHaveBeenCalledTimes(1);
    expect(respond('artifact:unknown')).toBe(true);
    expect(mock.openFile).not.toHaveBeenCalled();
    expect(respond('normal-read')).toBe(false);
  });
  it('does not open a failed tool result or mismatched descriptor owner', () => {
    const artifact = {
      type: 'artifact.presentation',
      version: 1,
      id: `a${++id}`,
      sessionId: 'other',
      path: 'docs/report.md',
      title: 'Report',
    };
    presentArtifactResult('present_artifact', false, artifact, 's');
    presentArtifactResult('present_artifact', true, artifact, 's');
    expect(mock.send).not.toHaveBeenCalled();
  });
});

import { expect, it } from 'vitest';
import { localArtifactPath } from '../src/components/artifact-navigation';
import { parseArtifact } from '../src/lib/artifacts';
import { initialState, reduceFrame } from '../src/lib/session';

const artifact = {
  type: 'artifact.presentation',
  version: 2,
  kind: 'text',
  id: 'report',
  sessionId: 'one',
  path: 'reports/result.md',
  title: 'Result',
};
it('makes a presented output available without opening it or injecting a prompt', () => {
  const state = { ...initialState(), id: 'one' };
  const next = reduceFrame(state, {
    type: 'tool.executed',
    payload: {
      id: 't',
      name: 'present_artifact',
      ok: true,
      output: JSON.stringify(artifact),
      durationMs: 2,
    },
  });
  expect(next.artifacts[0]?.title).toBe('Result');
  expect(next.messages).toEqual([]);
  expect(next.preview).toBeNull();
});
it.each(['../private.txt', '/absolute.txt', 'C:/secret.txt', 'dir\\secret.txt'])(
  'rejects an unsafe artifact path %s',
  (path) => {
    expect(parseArtifact(JSON.stringify({ ...artifact, path }), 'one')).toBeNull();
  },
);
it('ignores another session’s artifact and correlates file reads', () => {
  expect(parseArtifact(JSON.stringify(artifact), 'other')).toBeNull();
  const parsed = parseArtifact(JSON.stringify(artifact), 'one')!;
  const state = {
    ...initialState(),
    id: 'one',
    preview: { requestId: 'request', artifact: parsed, content: '', error: '', loading: true },
  };
  expect(
    reduceFrame(state, {
      type: 'files.read',
      payload: { requestId: 'stale', filePath: artifact.path, content: 'wrong' },
    }),
  ).toBe(state);
  const next = reduceFrame(state, {
    type: 'files.read',
    payload: { requestId: 'request', filePath: artifact.path, content: '# Result' },
  });
  expect(next.preview).toMatchObject({ content: '# Result', loading: false });
});

it('resolves local report links without fabricated HTTP paths or escaping the workspace', () => {
  expect(
    localArtifactPath(
      'http://127.0.0.1:3477/.temp_files/kanban-handoff/.temp_files/kanban-handoff/REPORT.md',
      'http://127.0.0.1:3477',
    ),
  ).toBe('.temp_files/kanban-handoff/REPORT.md');
  expect(
    localArtifactPath(
      './REPORT.md',
      'http://127.0.0.1:3477',
      '.temp_files/kanban-handoff/README.md',
    ),
  ).toBe('.temp_files/kanban-handoff/REPORT.md');
  expect(localArtifactPath('https://example.com/report.md', 'http://127.0.0.1:3477')).toBeNull();
  expect(localArtifactPath('../../escape.md', 'http://127.0.0.1:3477')).toBeNull();
  expect(localArtifactPath('#heading', 'http://127.0.0.1:3477')).toBeNull();
  expect(localArtifactPath('/C:/secret.txt', 'http://127.0.0.1:3477')).toBeNull();
  expect(
    localArtifactPath('http://127.0.0.1:3477/C:/secret.txt', 'http://127.0.0.1:3477'),
  ).toBeNull();
  expect(localArtifactPath('C%3A/secret.txt', 'http://127.0.0.1:3477')).toBeNull();
  expect(
    localArtifactPath('../../secret.md', 'http://127.0.0.1:3477', '/docs/guide.md'),
  ).toBeNull();
});

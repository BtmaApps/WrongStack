import { describe, expect, it } from 'vitest';
import { initialState, reduceFrame } from '../src/lib/session';
import {
  effortOptions,
  matchingFiles,
  parseFileTree,
  transcriptMarkdown,
} from '../src/lib/workspace-model';

describe('workspace runtime contracts', () => {
  it('preserves the active model’s advertised effort vocabulary', () => {
    const state = reduceFrame(initialState(), {
      type: 'session.start',
      payload: {
        sessionId: 'one',
        provider: 'account',
        model: 'real-model',
        reasoningEffortLevels: ['low', 'high'],
        effortSupported: true,
        projectReasoningEffort: 'high',
      },
    });
    expect(state.effortLevels).toEqual(['low', 'high']);
    expect(state.projectEffort).toBe('high');
  });
  it('does not present interrupted tools as successful when a run fails', () => {
    let state = reduceFrame(initialState(), {
      type: 'tool.started',
      payload: { id: 'tool', name: 'write_file', input: {} },
    });
    state = reduceFrame(state, {
      type: 'run.result',
      payload: { status: 'failed', iterations: 1 },
    });
    expect(state.tools[0]?.status).toBe('interrupted');
    expect(state.runFailure).toBeTruthy();
  });
  it('retains an abort as a queue boundary requiring a deliberate resume', () => {
    const state = reduceFrame(initialState(), {
      type: 'run.result',
      payload: { status: 'aborted', iterations: 1 },
    });
    expect(state.runFailure).toBeTruthy();
    expect(state.running).toBe(false);
  });
});

it('searches nested project files and skips malformed nodes', () => {
  const tree = parseFileTree([
    {
      name: 'src',
      path: 'src',
      type: 'directory',
      children: [{ name: 'App.tsx', path: 'src/App.tsx', type: 'file' }, { name: 42 }],
    },
  ]);
  expect(matchingFiles(tree, 'APP').map((node) => node.path)).toEqual(['src/App.tsx']);
  expect(matchingFiles(tree, 'missing')).toEqual([]);
});
it('uses advertised effort levels and keeps the configured override visible', () => {
  expect(effortOptions(['low', 'high', 'unsupported'], 'max')).toEqual([
    'auto',
    'low',
    'high',
    'max',
  ]);
  expect(effortOptions(undefined, 'auto')).toContain('medium');
});
it('exports a readable conversation without embedding image payloads or thinking blocks', () => {
  const result = transcriptMarkdown({
    project: 'Project',
    provider: 'account',
    model: 'live-model',
    messages: [
      { role: 'user', text: 'Build it', images: ['private-base64'] },
      { role: 'thinking', text: 'Hidden thought' },
      { role: 'assistant', text: 'Done' },
    ],
  });
  expect(result).toContain('## You\n\nBuild it');
  expect(result).toContain('[1 attached image(s)]');
  expect(result).toContain('## WrongStack\n\nDone');
  expect(result).not.toContain('private-base64');
  expect(result).not.toContain('Hidden thought');
});

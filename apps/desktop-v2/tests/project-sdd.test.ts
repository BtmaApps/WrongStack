import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyEngineState, reduceEngine } from '../src/engine-state';
import { ProjectSdd } from '../src/ProjectSdd';
import { sddGraphElements } from '../src/SddDependencyGraph';
import { SddLifecycle } from '../src/SddLifecycle';
import { SddTaskDetails } from '../src/SddTaskDetails';
import { parseSddSubtasks } from '../src/sdd-task-split';

describe('project SDD', () => {
  it('keeps project maintenance disabled while another project run is active', () => {
    const state = reduceEngine(emptyEngineState, {
      type: 'sdd.board.list',
      payload: { boards: [{ runId: 'live', status: 'running' }] },
    });
    const html = renderToStaticMarkup(
      createElement(SddLifecycle, {
        state,
        board: { runId: 'finished', status: 'completed' },
        boards: [{ runId: 'live', status: 'running' }],
        send: async () => {},
      }),
    );
    expect(html).toContain('Stop active project runs');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it('parses split tasks without discarding description delimiters or emitting empty titles', () => {
    expect(parseSddSubtasks(' First :: Check :: details\n\nSecond\n :: invalid')).toEqual([
      { title: 'First', description: 'Check :: details' },
      { title: 'Second', description: 'Second' },
    ]);
  });
  it('shows exact task routing and verification while withholding live controls for a finished run', () => {
    const task = {
      id: 'task-a',
      shortId: 't01',
      title: 'Verify project',
      model: 'model_exact',
      provider: 'provider_exact',
      verificationState: 'failed',
      verificationDetail: 'Tests failed',
      status: 'failed',
    };
    const html = renderToStaticMarkup(
      createElement(SddTaskDetails, {
        task,
        tasks: [task],
        board: { runId: 'run-a', status: 'completed' },
        waiting: false,
        request: async () => {},
        onSelect: () => {},
      }),
    );
    for (const value of ['model_exact', 'provider_exact', 'Tests failed'])
      expect(html).toContain(value);
    expect(html).not.toContain('Update model');
    expect(html).not.toContain('Delete task');
  });
  it('connects only dependencies present in the reported task graph', () => {
    const graph = sddGraphElements([
      { tasks: [{ id: 'a', shortId: 't01', title: 'First' }] },
      { tasks: [{ id: 'b', shortId: 't02', title: 'Second', deps: ['t01', 'missing'] }] },
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([['a', 'b']]);
  });
  it('keeps interview narration within the current project interview', () => {
    let state = reduceEngine(emptyEngineState, {
      type: 'sdd.spec.snapshot',
      payload: { sessionId: 'interview-a', title: 'A', phase: 'questioning' },
    });
    state = reduceEngine(state, {
      type: 'sdd.spec.agent_text',
      payload: { text: 'First question' },
    });
    expect(state.sddAgentText).toBe('First question');
    state = reduceEngine(state, {
      type: 'sdd.spec.snapshot',
      payload: { sessionId: 'interview-b', title: 'B', phase: 'questioning' },
    });
    expect(state.sddAgentText).toBe('');
    state = reduceEngine(state, {
      type: 'sdd.spec.snapshot',
      payload: {
        sessionId: 'interview-b',
        title: 'B',
        phase: 'questioning',
        lastAgentText: 'Resumed question',
      },
    });
    const html = renderToStaticMarkup(
      createElement(ProjectSdd, { state, send: async () => {}, http: async () => ({}) }),
    );
    expect(html).toContain('Resumed question');
    expect(html).not.toContain('First question');
    state = reduceEngine(state, {
      type: 'sdd.spec.snapshot',
      payload: { phase: 'idle', discarded: true },
    });
    expect(state.sddInterviewId).toBe('');
    expect(state.sddAgentText).toBe('');
  });
  it('accepts project specification frames even when they originate from a different session', () => {
    let state = reduceEngine(emptyEngineState, {
      type: 'session.start',
      payload: { sessionId: 'local' },
    });
    state = reduceEngine(state, {
      type: 'specs.list',
      payload: { sessionId: 'worker', specs: [{ id: 'spec-a', title: 'Project spec' }] },
    });
    expect(state.results['specs.list']?.['specs']).toEqual([
      { id: 'spec-a', title: 'Project spec' },
    ]);
    state = reduceEngine(state, {
      type: 'specs.detail',
      payload: { specId: 'spec-a', title: 'First' },
    });
    state = reduceEngine(state, {
      type: 'specs.detail',
      payload: { specId: 'spec-b', title: 'Second' },
    });
    expect(state.specDetails['spec-a']?.['title']).toBe('First');
    expect(state.specDetails['spec-b']?.['title']).toBe('Second');
    expect(state.messages).toEqual([]);
  });
});

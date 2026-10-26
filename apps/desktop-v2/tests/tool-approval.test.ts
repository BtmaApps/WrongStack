import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { emptyEngineState, reduceEngine } from '../src/engine-state';
import { ToolApprovalCard } from '../src/ToolApprovalCard';

describe('desktop tool approvals', () => {
  const send = vi.fn(async () => {});
  it('shows the executable together with every argument and the available decision scopes', () => {
    const html = renderToStaticMarkup(
      createElement(ToolApprovalCard, {
        approval: {
          id: 'approval-1',
          toolName: 'exec',
          suggestedPattern: 'git config --local',
          riskTier: 'destructive',
          input: {
            command: 'git',
            args: ['config', '--local', 'safe.fixture', 'enabled'],
            cwd: 'src',
            options: { timeout: 7, force: false },
          },
        },
        send,
        connected: true,
      }),
    );
    for (const text of [
      'Command',
      'git',
      'config',
      '--local',
      'safe.fixture',
      'enabled',
      'cwd',
      'src',
      'timeout',
      'false',
      'Destructive',
      'This exact request',
      'This executable, with any arguments',
      'All requests for exec',
      'Remember denial',
      'Deny',
      'Allow once',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('&quot;args&quot;:');
  });
  it('shows edit content as a readable diff and does not offer persistent allow over a user rule', () => {
    const html = renderToStaticMarkup(
      createElement(ToolApprovalCard, {
        approval: {
          id: 'approval-2',
          toolName: 'edit',
          decisionSource: 'yolo_user_rule',
          boundaryReason: 'The project rule requires approval.',
          input: {
            path: 'src/a.ts',
            old_string: 'const a = 1;',
            new_string: 'const a = 2;',
            replace_all: false,
          },
        },
        send,
        connected: true,
      }),
    );
    for (const text of [
      'Proposed edit',
      'src/a.ts',
      'const a = 1;',
      'const a = 2;',
      'replace all',
      'The project rule requires approval.',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('Allow &amp; remember');
    expect(html).not.toContain('Remembered approval scope');
  });
  it('keeps a pending confirmation through an unrelated session event and removes it only on its resolution', () => {
    let state = reduceEngine(emptyEngineState, {
      type: 'session.start',
      payload: { sessionId: 'session-a' },
    });
    state = reduceEngine(state, {
      type: 'tool.confirm_needed',
      payload: { sessionId: 'session-a', id: 'confirm-a', toolName: 'exec' },
    });
    state = reduceEngine(state, {
      type: 'tool.confirm_resolved',
      payload: { sessionId: 'session-b', id: 'confirm-a' },
    });
    expect(state.approvals).toHaveLength(1);
    state = reduceEngine(state, {
      type: 'tool.confirm_resolved',
      payload: { sessionId: 'session-a', id: 'confirm-a', source: 'user', decision: 'yes' },
    });
    expect(state.approvals).toEqual([]);
  });
});

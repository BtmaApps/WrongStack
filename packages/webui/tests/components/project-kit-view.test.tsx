import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectKitView } from '../../src/components/ProjectKitView';
import { useConfigStore } from '../../src/stores/config-store';
import { useSessionLanes } from '../../src/stores/session-lanes';
import { useUIStore } from '../../src/stores/ui-store';

const summary = {
  name: 'settings.parity',
  description: 'Find missing settings across interfaces.',
  effects: 'read',
  revision: 'a'.repeat(64),
};
const kit = {
  ...summary,
  verified: true,
  guide: 'Run when settings change.',
  timeoutMs: 30000,
  entry: 'main.mjs',
  files: ['kit.json', 'main.mjs'],
  inputSchema: {
    type: 'object',
    properties: {
      setting: { type: 'string', description: 'The setting to inspect.', default: 'toolCoach' },
    },
    required: ['setting'],
  },
  outputSchema: { type: 'object' },
  tests: [
    {
      name: 'known missing setting',
      input: { setting: 'missing' },
      expected: { missing: ['webui'] },
    },
  ],
  history: [
    {
      runId: 'one',
      action: 'verify',
      status: 'passed',
      startedAt: '2026-09-28T10:00:00Z',
      revision: summary.revision,
      durationMs: 120,
    },
  ],
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(() => {
  useSessionLanes.setState({ activeSessionId: null });
  useConfigStore.setState({ wsConnected: true });
  useUIStore.setState({ currentView: 'project-kit', promptInsertRequest: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mockCatalog() {
  const fetcher = vi.fn(async (url: string) =>
    response(
      url.includes('name=')
        ? { projectRoot: '/project', kit }
        : { projectRoot: '/project', tools: [summary], invalid: [] },
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('Project Kit view', () => {
  it('shows details and history, and prepares a parameterized draft without executing', async () => {
    const fetcher = mockCatalog();
    render(<ProjectKitView />);
    fireEvent.click(await screen.findByRole('button', { name: /settings.parity/ }));
    expect(await screen.findByText('Verified revision')).toBeTruthy();
    expect(screen.getByText('Run when settings change.')).toBeTruthy();
    expect(screen.getByText('Passed')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Parameters (JSON)'), {
      target: { value: '{"setting":"theme"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use in chat' }));
    expect(useUIStore.getState().promptInsertRequest).toContain('"setting":"theme"');
    expect(useUIStore.getState().promptInsertRequest).toContain(summary.revision);
    expect(useUIStore.getState().currentView).toBe('chat');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every((call) => !String(call[0]).includes('run'))).toBe(true);
  });
  it('rejects invalid JSON and supports search without inventing results', async () => {
    mockCatalog();
    render(<ProjectKitView />);
    fireEvent.click(await screen.findByRole('button', { name: /settings.parity/ }));
    await screen.findByText('Verified revision');
    fireEvent.change(screen.getByLabelText('Parameters (JSON)'), { target: { value: '[]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use in chat' }));
    expect(screen.getByRole('alert').textContent).toContain('valid JSON object');
    expect(useUIStore.getState().promptInsertRequest).toBeNull();
    fireEvent.change(screen.getByLabelText('Search kits…'), {
      target: { value: 'does-not-exist' },
    });
    expect(screen.getByText('No kits match your search.')).toBeTruthy();
  });
  it('handles empty catalogs and retryable errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ error: 'Offline' }, 503))
        .mockResolvedValue(response({ projectRoot: '/project', tools: [], invalid: [] })),
    );
    render(<ProjectKitView />);
    expect((await screen.findByRole('alert')).textContent).toContain('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No project tools yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create in chat' }));
    expect(useUIStore.getState().promptInsertRequest).toContain('Create a reusable Project Kit');
  });

  it('keeps edited parameters when a cached detail is refreshed for the same revision', async () => {
    let finishRefresh!: (value: Response) => void;
    const fetcher = mockCatalog();
    render(<ProjectKitView />);
    fireEvent.click(await screen.findByRole('button', { name: /settings.parity/ }));
    await screen.findByText('Verified revision');
    fireEvent.click(screen.getByRole('button', { name: 'Project tools', exact: true }));
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: /settings.parity/ }));
    fireEvent.change(screen.getByLabelText('Parameters (JSON)'), {
      target: { value: '{"setting":"theme"}' },
    });
    await act(async () => {
      finishRefresh(response({ projectRoot: '/project', kit }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use in chat' }));
    expect(useUIStore.getState().promptInsertRequest).toContain('"setting":"theme"');
  });
  it('hides the old project immediately and ignores late responses after a session switch', async () => {
    let resolveOld!: (result: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue(response({ projectRoot: '/new-project', tools: [], invalid: [] }));
    vi.stubGlobal('fetch', fetcher);
    render(<ProjectKitView />);
    await act(async () => {
      useSessionLanes.setState({ activeSessionId: 'new-session' });
    });
    await screen.findByText('/new-project');
    await act(async () => {
      resolveOld(response({ projectRoot: '/old-project', tools: [summary], invalid: [] }));
    });
    await waitFor(() => expect(screen.queryByText('/old-project')).toBeNull());
    expect(screen.queryByRole('button', { name: /settings.parity/ })).toBeNull();
    expect(fetcher.mock.calls[1]?.[0]).toContain('sessionId=new-session');
  });
});

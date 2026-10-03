// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AutomationJobInput } from '@wrongstack/webui-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationPanel } from '../../../simpleui/src/automation-panel.js';
import { AutomationWorkspace as SimpleWorkspace } from '../../../simpleui/src/automation-workspace.js';
import { dispatchSimplePanel } from '../../../simpleui/src/lib/panel-events.js';
import { AutomationWorkspace as WebWorkspace } from '../../src/components/AutomationView.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@wrongstack/webui-protocol', async (original) => ({
  ...(await original<object>()),
  automationRequest: request,
}));
vi.mock('@/stores', () => ({
  useSessionStore: () => '/fixture',
  useActiveSessionId: () => 'fixture-session',
}));
const empty = { jobs: [], runs: [], workerOnline: false };
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(empty);
});
afterEach(() => cleanup());

describe.each([
  ['WebUI', WebWorkspace],
  ['SimpleUI', SimpleWorkspace],
] as const)('%s automation management', (_name, Workspace) => {
  it('shows unknown cost and keeps agent test claims distinct from verification', async () => {
    request.mockResolvedValue({
      ...empty,
      runs: [
        {
          id: 'run',
          jobId: 'job',
          subjectKey: 'default',
          trigger: 'manual',
          status: 'completed',
          createdAt: 0,
          result: {
            version: 1,
            durationMs: 1200,
            agentStatus: 'done',
            sessionId: 's',
            finalText: 'All tests passed',
            usage: {
              inputTokens: 10,
              outputTokens: 5,
              iterations: 1,
              costUsd: null,
              costSource: 'unknown',
            },
            changedFiles: ['src/a.ts'],
            changedFilesTruncated: false,
            validation: { status: 'not-verified', evidence: ['output.log', 'changes.patch'] },
          },
        },
      ],
    });
    render(<Workspace />);
    await screen.findByText(/Cost unknown/);
    expect(screen.getByText(/Tests not independently verified/)).toBeTruthy();
    expect(screen.getByText('All tests passed')).toBeTruthy();
    expect(screen.getByText(/src\/a.ts/)).toBeTruthy();
  });
  it('loads portable jobs for review without preserving unattended permissions', async () => {
    render(<Workspace sessionId="review-session" />);
    await screen.findByText('No jobs in this project.');
    const spec = {
      name: 'Imported',
      image: 'trusted:1',
      prompt: 'Review',
      enabled: true,
      yolo: true,
      timeoutMs: 60000,
      envNames: [],
    };
    fireEvent.change(screen.getByLabelText('Portable job JSON'), {
      target: { value: JSON.stringify({ type: 'wrongstack.automation', version: 1, spec }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load for review' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Imported'),
    );
    expect(
      (
        screen.getByLabelText(
          'Allow unattended tool execution in the container',
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(request.mock.calls.find(([route]) => route === 'preview')?.[4]).toBe('review-session');
    expect(request.mock.calls.some(([route]) => route === 'jobs')).toBe(false);
  });
  it('sends calendar and credential references through the shared management contract', async () => {
    request.mockImplementation(async (route: string, _method: string, body: { spec: object }) => {
      if (route === 'preview')
        return { nextRunTimes: [Date.parse('2026-10-05T06:00:00Z')], missingReferences: [] };
      if (route === 'jobs') return { ...body.spec, id: 'fixture-id', revision: 1 };
      return empty;
    });
    render(<Workspace />);
    await screen.findByText('No jobs in this project.');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Daily review' } });
    fireEvent.change(screen.getByLabelText('Runtime image'), { target: { value: 'trusted:1' } });
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Review changes' } });
    fireEvent.change(screen.getByLabelText('Schedule'), { target: { value: 'cron' } });
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Europe/Istanbul' } });
    const environment = screen.getByLabelText('Environment names') as HTMLInputElement;
    for (const character of 'FIRST_KEY,SECOND_KEY')
      fireEvent.change(environment, { target: { value: environment.value + character } });
    fireEvent.change(screen.getByLabelText('Saved credential references'), {
      target: { value: 'OPENAI_API_KEY=default/team/work' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Next scheduled runs');
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }));
    await screen.findByRole('button', { name: 'Save changes' });
    const call = request.mock.calls.find(([route]) => route === 'jobs')!;
    const spec = (call[2] as { spec: AutomationJobInput }).spec;
    expect(spec.schedule).toEqual({
      type: 'cron',
      expression: '0 9 * * 1-5',
      timezone: 'Europe/Istanbul',
    });
    expect(spec.credentials).toEqual([
      { envName: 'OPENAI_API_KEY', profile: 'default', provider: 'team', keyLabel: 'work' },
    ]);
    expect(spec.yolo).toBe(false);
    expect(spec.envNames).toEqual(['FIRST_KEY', 'SECOND_KEY']);
  });
  it('binds manual dispatch to the active session and observed job revision', async () => {
    const job = {
      id: 'fixture-id',
      revision: 3,
      createdAt: 0,
      nextRunAt: null,
      projectRoot: '/second',
      name: 'Scoped',
      image: 'trusted:1',
      prompt: 'Review',
      envNames: [],
      yolo: false,
      enabled: true,
      timeoutMs: 60000,
    };
    request.mockImplementation(async (route: string) =>
      route === 'state' ? { ...empty, jobs: [job] } : {},
    );
    render(<Workspace sessionId="second-session" />);
    await screen.findByText('Scoped');
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() =>
      expect(request.mock.calls.some(([route]) => route === 'jobs/fixture-id/run')).toBe(true),
    );
    const call = request.mock.calls.find(([route]) => route === 'jobs/fixture-id/run')!;
    expect(call[2]).toEqual({ expectedRevision: 3 });
    expect(call[4]).toBe('second-session');
  });
  it('does not display a preview calculated for a subsequently edited form', async () => {
    let finish!: (value: unknown) => void;
    request.mockImplementation((route: string) =>
      route === 'preview'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(empty),
    );
    render(<Workspace />);
    await screen.findByText('No jobs in this project.');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(finish).toBeDefined());
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'new request' } });
    await act(async () => finish({ nextRunTimes: [1000], missingReferences: [] }));
    expect(screen.queryByText('Next scheduled runs')).toBeNull();
  });
  it('edits using the observed revision and leaves generated record fields out of the spec', async () => {
    const job = {
      id: 'fixture-id',
      revision: 3,
      createdAt: 0,
      nextRunAt: null,
      projectRoot: '/fixture',
      name: 'Existing',
      image: 'trusted:1',
      prompt: 'Old',
      envNames: [],
      yolo: false,
      enabled: true,
      timeoutMs: 60000,
    };
    request.mockImplementation(async (route: string, method: string) =>
      route === 'state'
        ? { ...empty, jobs: [job] }
        : method === 'PUT'
          ? { ...job, revision: 4 }
          : empty,
    );
    render(<Workspace />);
    await screen.findByText('Existing');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(request.mock.calls.some((call) => call[1] === 'PUT')).toBe(true));
    const call = request.mock.calls.find((entry) => entry[1] === 'PUT')!;
    const body = call[2] as { expectedRevision: number; spec: AutomationJobInput };
    expect(body.expectedRevision).toBe(3);
    expect(body.spec.prompt).toBe('New');
    expect(body.spec).not.toHaveProperty('revision');
    expect(body.spec).not.toHaveProperty('id');
  });
});

it('opens SimpleUI automations from the utility event and closes when another panel activates', async () => {
  render(<AutomationPanel projectRoot="/fixture" />);
  act(() => dispatchSimplePanel('open-automation'));
  await screen.findByRole('dialog', { name: 'Automations' });
  act(() => dispatchSimplePanel('open-auth'));
  expect(screen.queryByRole('dialog', { name: 'Automations' })).toBeNull();
});

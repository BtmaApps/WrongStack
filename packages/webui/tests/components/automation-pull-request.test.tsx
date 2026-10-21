// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AutomationPullRequestView } from '@wrongstack/webui-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationPullRequestPanel as SimplePanel } from '../../../simpleui/src/automation-pull-request.js';
import { AutomationPullRequestPanel as WebPanel } from '../../src/components/AutomationPullRequestPanel.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@wrongstack/webui-protocol', async (original) => ({
  ...(await original<object>()),
  automationRequest: request,
}));
const prepared: AutomationPullRequestView = {
  plan: {
    version: 1,
    runId: 'run',
    repository: 'owner/repo',
    base: 'main',
    branch: 'wrongstack/automation/run',
    baseCommit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    candidateTree: 'c'.repeat(40),
    patchSha256: 'p',
    verificationSha256: 'v',
    title: 'Fix parser',
    body: 'Independent checks passed.\nReview the candidate.',
    files: ['src/parser.ts'],
    createdAt: 1,
    fingerprint: 'f'.repeat(64),
  },
  receipt: null,
  ci: null,
};
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ plan: null, receipt: null, ci: null });
});
afterEach(cleanup);
describe.each([
  ['WebUI', WebPanel],
  ['SimpleUI', SimplePanel],
] as const)('%s draft PR workflow', (_name, Panel) => {
  it('requires preparation and review before explicit publication, and refreshes CI on demand', async () => {
    render(<Panel runId="run" sessionId="project-session" />);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review draft PR' }));
    await screen.findByRole('button', { name: 'Prepare PR plan' });
    fireEvent.change(screen.getByLabelText('PR repository'), { target: { value: 'owner/repo' } });
    fireEvent.change(screen.getByLabelText('PR title'), { target: { value: 'Fix parser' } });
    request.mockResolvedValueOnce(prepared);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare PR plan' }));
    await screen.findByText('src/parser.ts');
    expect(request).toHaveBeenLastCalledWith(
      'runs/run/pr/prepare',
      'POST',
      { repository: 'owner/repo', base: 'main', title: 'Fix parser' },
      undefined,
      'project-session',
    );
    expect(request.mock.calls.some(([route]) => route.endsWith('/publish'))).toBe(false);
    const published = {
      ...prepared,
      receipt: {
        fingerprint: prepared.plan!.fingerprint,
        commit: 'd'.repeat(40),
        number: 7,
        url: 'https://github.com/owner/repo/pull/7',
        draft: true,
      },
    };
    request.mockResolvedValueOnce(published);
    fireEvent.click(screen.getByRole('button', { name: 'Publish draft PR to GitHub' }));
    await screen.findByRole('link', { name: 'Open draft PR #7' });
    expect(request).toHaveBeenLastCalledWith(
      'runs/run/pr/publish',
      'POST',
      { fingerprint: 'f'.repeat(64) },
      undefined,
      'project-session',
    );
    request.mockResolvedValueOnce({
      ...published,
      ci: {
        commit: 'd'.repeat(40),
        status: 'failed',
        checkedAt: 2,
        checks: [{ name: 'tests', status: 'completed', conclusion: 'failure' }],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh CI' }));
    await screen.findByText('tests: failure');
    expect(screen.getByRole('status').textContent).toContain('failed');
  });
  it('shows a publication error and preserves the reviewed plan for an explicit retry', async () => {
    request.mockResolvedValueOnce(prepared);
    render(<Panel runId="run" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review draft PR' }));
    await screen.findByText('src/parser.ts');
    request.mockRejectedValueOnce(new Error('Remote base moved'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish draft PR to GitHub' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe('Remote base moved');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish draft PR to GitHub' })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(request.mock.calls.filter(([route]) => route.endsWith('/publish'))).toHaveLength(1);
  });
  it('queues a CI repair only on explicit action and sends the displayed CI fingerprint', async () => {
    const failed: AutomationPullRequestView = {
      ...prepared,
      receipt: {
        fingerprint: prepared.plan!.fingerprint,
        commit: 'd'.repeat(40),
        number: 7,
        url: 'https://github.com/owner/repo/pull/7',
        draft: true,
      },
      ci: {
        commit: 'd'.repeat(40),
        status: 'failed',
        checkedAt: 2,
        fingerprint: 'c'.repeat(64),
        checks: [{ name: 'tests', status: 'completed', conclusion: 'failure' }],
      },
    };
    request.mockResolvedValueOnce(failed);
    render(<Panel runId="run" sessionId="project-session" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review draft PR' }));
    await screen.findByRole('button', { name: 'Queue CI repair' });
    expect(request.mock.calls.some(([route]) => route.endsWith('/follow-up'))).toBe(false);
    request.mockResolvedValueOnce({ ...failed, followUpRunId: 'repair-run' });
    fireEvent.click(screen.getByRole('button', { name: 'Queue CI repair' }));
    await screen.findByText('repair-run');
    expect(request).toHaveBeenLastCalledWith(
      'runs/run/pr/follow-up',
      'POST',
      { fingerprint: 'c'.repeat(64) },
      undefined,
      'project-session',
    );
    expect(screen.queryByRole('button', { name: 'Queue CI repair' })).toBeNull();
  });
  it('prefills a repair target and clearly reviews an update to the existing PR', async () => {
    request.mockResolvedValueOnce({
      plan: null,
      receipt: null,
      ci: null,
      suggestedTarget: { repository: 'owner/repo', base: 'main', title: 'Fix parser' },
    });
    render(<Panel runId="repair" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review draft PR' }));
    expect(await screen.findByDisplayValue('owner/repo')).toBeTruthy();
    const updated = {
      ...prepared,
      plan: {
        ...prepared.plan!,
        target: { sourceRunId: 'run', number: 7, headCommit: 'd'.repeat(40) },
      },
    };
    request.mockResolvedValueOnce(updated);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare PR plan' }));
    expect(
      await screen.findByRole('button', { name: 'Publish verified update to the same PR' }),
    ).toBeTruthy();
    expect(screen.getByText(/#7 · d/)).toBeTruthy();
    expect(request.mock.calls.some(([route]) => route.endsWith('/publish'))).toBe(false);
  });
});

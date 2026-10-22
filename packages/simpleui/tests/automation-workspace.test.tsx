// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutomationWorkspace } from '../src/automation-workspace.js';
import { AutomationEnvironmentRun } from '../src/automation-environment.js';

let host: HTMLDivElement, root: Root;
const empty = { jobs: [], runs: [], workerOnline: false };
const profile = {
  version: 1,
  name: 'project',
  image: 'trusted:1',
  setupCommands: [['bun', 'install', '--frozen-lockfile']],
  setupTimeoutMs: 30_000,
  services: [],
  caches: [],
  ports: [],
};
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount(view: React.ReactNode) {
  await act(async () => {
    root.render(view);
  });
}
async function field(label: string, value: string) {
  const row = [...host.querySelectorAll('label')].find(
    (node) => node.textContent?.trim() === label,
  );
  const input = row?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
  expect(input, label).toBeTruthy();
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function button(text: string) {
  const target = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(target, text).toBeTruthy();
  await act(async () => {
    target!.click();
  });
}
it('saves an imported environment and independently authored verification through the real request adapter', async () => {
  const saved: Array<{ spec: { image: string; environment: unknown; verification: unknown } }> = [];
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    expect(url).toContain('sessionId=review-session');
    if (url.startsWith('/api/automation/state')) return reply(empty);
    if (url.startsWith('/api/automation/jobs') && options?.method === 'POST') {
      const payload = JSON.parse(String(options.body));
      saved.push(payload);
      return reply({ ...payload.spec, id: 'job', revision: 1 });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  await mount(<AutomationWorkspace sessionId="review-session" />);
  await field('Name', 'Verify project');
  await field('Task', 'Implement the change');
  await field(
    'Environment profile JSON',
    JSON.stringify({ type: 'wrongstack.environment', version: 1, profile }),
  );
  await button('Load environment for review');
  expect(host.textContent).toContain('project · v1');
  const image = [...host.querySelectorAll('input')].find((node) => node.value === 'trusted:1');
  expect(image?.readOnly).toBe(true);
  await field('Verification commands', 'bun run test\nbun run typecheck');
  await field('Verification timeout in seconds', '12');
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]!.spec).toMatchObject({
    image: 'trusted:1',
    environment: profile,
    verification: {
      commands: [
        ['bun', 'run', 'test'],
        ['bun', 'run', 'typecheck'],
      ],
      timeoutMs: 12_000,
    },
  });
  expect(fetch.mock.calls.every(([, options]) => options?.credentials === 'include')).toBe(true);
});
it('reports invalid environment input and permits removing an attached profile', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply(empty)),
  );
  await mount(<AutomationWorkspace />);
  await field('Environment profile JSON', '{broken');
  await button('Load environment for review');
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  await field('Runtime image', 'trusted:1');
  await button('Create profile draft');
  await button('Load environment for review');
  expect(host.querySelector('[download="project.environment.json"]')).toBeTruthy();
  await button('Remove environment');
  expect(host.querySelector('[download="project.environment.json"]')).toBeNull();
});
it('keeps agent claims, unknown cost and independent test evidence distinct in run history', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      reply({
        ...empty,
        runs: [
          {
            id: 'run',
            jobId: 'job',
            status: 'completed',
            subjectKey: 'branch',
            createdAt: 0,
            result: {
              version: 1,
              durationMs: 1200,
              agentStatus: 'done',
              finalText: 'All tests passed',
              usage: { costUsd: null, inputTokens: 10, outputTokens: 5, iterations: 1 },
              changedFiles: ['src/app.ts'],
              validation: { status: 'not-verified', evidence: ['output.log', 'changes.patch'] },
            },
          },
        ],
      }),
    ),
  );
  await mount(<AutomationWorkspace />);
  expect(host.textContent).toContain('All tests passed');
  expect(host.textContent).toContain('Tests not independently verified.');
  expect(host.textContent).toContain('Cost unknown');
  expect(host.textContent).toContain('src/app.ts');
  expect(
    [...host.querySelectorAll('button')].some((node) =>
      node.textContent?.includes('Create pull request'),
    ),
  ).toBe(false);
});
it('scopes live environment receipts to the session and removes stale local links after a failed refresh', async () => {
  vi.useFakeTimers();
  const receipt = {
    name: 'project',
    status: 'ready',
    phase: 'candidate',
    fingerprint: 'fingerprint',
    services: [],
    caches: [{ name: 'bun', persistent: true }],
    setup: [{ argv: ['bun', 'install'], exitCode: 0, durationMs: 20, output: 'ok' }],
    ports: [{ name: 'web', protocol: 'http', port: 3000, hostPort: 45123 }],
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(reply({ content: JSON.stringify(receipt) }))
    .mockResolvedValue(reply({ error: 'Not available' }, 503));
  vi.stubGlobal('fetch', fetch);
  await mount(<AutomationEnvironmentRun runId="run" sessionId="tab-a" running />);
  await act(async () => {
    const details = host.querySelector('details')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
  expect(host.querySelector('a')?.getAttribute('href')).toBe('http://127.0.0.1:45123');
  expect(fetch.mock.calls[0]![0]).toBe(
    '/api/automation/runs/run/artifact?name=environment.json&sessionId=tab-a',
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(host.querySelector('a')).toBeNull();
  expect(host.textContent).toContain('Environment receipt is not available yet.');
});

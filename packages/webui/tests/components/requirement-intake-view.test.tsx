import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequirementIntakeView } from '@/components/RequirementIntakeView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const INTAKES = [
  {
    id: 'reqi_list1',
    title: 'Add email-based password reset',
    requestType: 'feature',
    status: 'submitted',
    priority: 'high',
    updatedAt: Date.now() - 5 * 60_000,
    createdAt: Date.now() - 60_000,
  },
  {
    id: 'reqi_list2',
    title: 'Fix flaky CI retry',
    requestType: 'bug_fix',
    status: 'draft',
    priority: 'unspecified',
    updatedAt: Date.now() - 3 * 60_000,
    createdAt: Date.now() - 3 * 60_000,
  },
];

describe('RequirementIntakeView', () => {
  it('lists intake records from the server-resolved endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ projectId: 'proj_alpha', intakes: INTAKES }));

    render(<RequirementIntakeView />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-intakes');
    });
    expect(await screen.findByText('Add email-based password reset')).toBeTruthy();
    expect(screen.getByText('Fix flaky CI retry')).toBeTruthy();
    expect(screen.getByText('reqi_list1')).toBeTruthy();
    expect(screen.getAllByText('submitted').length).toBeGreaterThan(0);
  });

  it('shows an empty state when no records exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ projectId: 'proj_alpha', intakes: [] }),
    );

    render(<RequirementIntakeView />);

    expect(await screen.findByText(/No intake records yet/)).toBeTruthy();
  });

  it('surfaces a load error with a retry action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: { message: 'List failed (HTTP 500)' } }, 500),
    );

    render(<RequirementIntakeView />);

    expect(await screen.findByText(/List failed/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('creates and submits a record through the REST endpoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ projectId: 'proj_alpha', intakes: [] }))
      .mockResolvedValueOnce(jsonResponse({ record: { ...INTAKES[0], id: 'reqi_new' } }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ record: { ...INTAKES[0], id: 'reqi_new', status: 'submitted' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          projectId: 'proj_alpha',
          intakes: [{ ...INTAKES[0], id: 'reqi_new', title: 'Ship the dashboard' }],
        }),
      );

    render(<RequirementIntakeView />);
    await screen.findByText(/No intake records yet/);

    fireEvent.change(screen.getByLabelText(/Request text/), {
      target: { value: 'Ship the dashboard' },
    });
    fireEvent.click(screen.getByRole('button', { name: /File \+ submit/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj_alpha/requirement-intakes',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirement-intakes/reqi_new/submit',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/Intake recorded and submitted/)).toBeTruthy();
    expect(await screen.findByText('Ship the dashboard')).toBeTruthy();

    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/projects/') &&
        String(url).endsWith('/requirement-intakes') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse(String((createCall?.[1] as RequestInit | undefined)?.body)) as {
      originalRequest: string;
    };
    expect(body.originalRequest).toBe('Ship the dashboard');
  });

  it('reuses the same idempotency key when submission is retried', async () => {
    const createBodies: Array<{ idempotencyKey?: string }> = [];
    const recordsByKey = new Map<string, string>();
    const submitUrls: string[] = [];
    let nextId = 1;
    let listCalls = 0;
    let submitCalls = 0;
    let submittedId = 'reqi_retry_1';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/requirement-intakes') {
        listCalls++;
        return jsonResponse({
          projectId: 'proj_alpha',
          intakes:
            listCalls > 1 ? [{ ...INTAKES[0], id: submittedId, title: 'Retry this intake' }] : [],
        });
      }
      if (url.endsWith('/requirement-intakes') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { idempotencyKey?: string };
        createBodies.push(body);
        const key = body.idempotencyKey;
        let id = key === undefined ? undefined : recordsByKey.get(key);
        if (id === undefined) {
          id = `reqi_retry_${nextId++}`;
          if (key !== undefined) recordsByKey.set(key, id);
        }
        return jsonResponse({ record: { ...INTAKES[0], id } }, 201);
      }
      if (url.endsWith('/submit') && init?.method === 'POST') {
        submitUrls.push(url);
        submitCalls++;
        submittedId = url.split('/').at(-2) ?? submittedId;
        return submitCalls === 1
          ? jsonResponse({ error: { message: 'Submit unavailable' } }, 502)
          : jsonResponse({ record: { ...INTAKES[0], id: submittedId, status: 'submitted' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<RequirementIntakeView />);
    await screen.findByText(/No intake records yet/);
    fireEvent.change(screen.getByLabelText(/Request text/), {
      target: { value: 'Retry this intake' },
    });

    fireEvent.click(screen.getByRole('button', { name: /File \+ submit/ }));
    expect(await screen.findByText('Submit unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /File \+ submit/ }));
    expect(await screen.findByText(/Intake recorded and submitted/)).toBeTruthy();

    expect(createBodies).toHaveLength(2);
    expect(createBodies[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(createBodies[1]?.idempotencyKey).toBe(createBodies[0]?.idempotencyKey);
    expect(submitUrls).toEqual([
      '/api/requirement-intakes/reqi_retry_1/submit',
      '/api/requirement-intakes/reqi_retry_1/submit',
    ]);
  });

  it('blocks submission when the request text is blank', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ projectId: 'proj_alpha', intakes: [] }),
    );

    render(<RequirementIntakeView />);
    await screen.findByText(/No intake records yet/);

    const submitButton = screen.getByRole('button', { name: /File \+ submit/ });
    expect(submitButton).toHaveProperty('disabled', true);
  });

  it('keeps the Copied indicator for the full window when a second record is copied mid-window', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        projectId: 'proj_alpha',
        intakes: [
          { ...INTAKES[0], originalRequest: 'Alpha verbatim request' },
          { ...INTAKES[1], originalRequest: 'Beta verbatim request' },
        ],
      }),
    );

    render(<RequirementIntakeView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Expand record A and copy its original request.
    fireEvent.click(screen.getByRole('button', { name: /Add email-based password reset/ }));
    fireEvent.click(screen.getByRole('button', { name: /Copy request/ }));
    expect(screen.getByText('Copied!')).toBeTruthy();

    // Copy record B 1s into A's 1.5s indicator window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    fireEvent.click(screen.getByRole('button', { name: /Fix flaky CI retry/ }));
    fireEvent.click(screen.getByRole('button', { name: /Copy request/ }));
    expect(screen.getByText('Copied!')).toBeTruthy();

    // t=1600ms — the stale first timer fires pre-fix and wrongly clears B's indicator.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByText('Copied!')).toBeTruthy();

    // B's own window ends at t=2500ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByText('Copied!')).toBeNull();
  });
});

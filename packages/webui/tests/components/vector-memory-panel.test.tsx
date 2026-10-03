/**
 * VectorMemoryPanel — inline expand + Forget flow tests.
 *
 * The panel fetches over plain `fetch` (not the WS client), so the network
 * boundary is stubbed with a URL-keyed route map: status/search/forget each
 * get a resolvable Response. Covers the master-detail expand convention
 * (collapsed = truncated preview + no detail; expanded = full text + id/score
 * fields), the destructive confirmation dialog before DELETE, optimistic
 * removal from the hit list, and the disabled-state contract (no interactive
 * surface at all).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCalls: string[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const statusEnabled = {
  enabled: true,
  providerId: 'transformers',
  modelId: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  entries: 2,
  vectors: 2,
  providers: ['transformers'],
};

const hitsPayload = {
  hits: [
    {
      id: 'vm_alpha',
      score: 0.912,
      text: 'Alpha entry '.repeat(60), // long enough to truncate at 170 chars
      summary: 'alpha summary',
      tags: ['webui', 'vector'],
    },
    {
      id: 'vm_beta',
      score: 0.704,
      text: 'Beta entry — short text.',
      tags: [],
    },
  ],
  count: 2,
  similarity: [
    [1.0, 0.2],
    [0.2, 1.0],
  ],
};

let forgetStatus = 200;
let forgetBody: unknown = { removed: true };

// Scripted search bodies: when non-empty, the next search consumes the
// front of the queue; when empty, the default hitsPayload is served.
// Used to drive cursor pages and provenance payloads per test.
let searchBodies: Array<unknown> = [];

// Deferred-promise gates for the interleaving test: when a hold flag is set,
// the NEXT matching fetch returns a promise the test resolves manually.
let holdSearchResponse = false;
let holdDeleteResponse = false;
let searchGate: ((body: unknown) => void) | null = null;
let deleteGate: ((body: unknown) => void) | null = null;

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  fetchCalls.push(`${init?.method ?? 'GET'} ${url}`);
  if (url.includes('/api/vector-memory/status')) {
    return Promise.resolve(jsonResponse(200, statusEnabled));
  }
  if (url.includes('/api/vector-memory/search')) {
    if (holdSearchResponse) {
      holdSearchResponse = false;
      return new Promise<Response>((resolve) => {
        searchGate = (body) => resolve(jsonResponse(200, body));
      });
    }
    if (searchBodies.length > 0) {
      return Promise.resolve(jsonResponse(200, searchBodies.shift()));
    }
    return Promise.resolve(jsonResponse(200, hitsPayload));
  }
  if (url.includes('/api/vector-memory/store/vm_alpha')) {
    if (holdDeleteResponse) {
      holdDeleteResponse = false;
      return new Promise<Response>((resolve) => {
        deleteGate = (body) => resolve(jsonResponse(200, body));
      });
    }
    return Promise.resolve(jsonResponse(forgetStatus, forgetBody));
  }
  return Promise.resolve(jsonResponse(404, { error: 'unexpected route' }));
}

vi.stubGlobal(
  'fetch',
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => routeFetch(input, init)),
);

import type { SharedMemorySearch } from '../../src/components/MemoryManager/sharedSearch.js';
import { VectorMemoryPanel } from '../../src/components/vector-memory-panel/index.js';
import { previewText, searchVectorMemory } from '../../src/components/vector-memory-panel/model.js';

describe('vector search provider errors', () => {
  it('explains the typed provider failure without exposing server details', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(503, {
        code: 'EMBEDDING_PROVIDER_UNAVAILABLE',
        detail: 'internal error',
      }),
    );
    await expect(searchVectorMemory('sage')).rejects.toThrow(
      'Ensure the optional @huggingface/transformers backend is installed',
    );
  });

  it('preserves HTTP errors for non-JSON failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    await expect(searchVectorMemory('sage')).rejects.toThrow('search failed: HTTP 503');
  });
});

const alphaToggle = () => screen.getByRole('button', { name: /0\.912\s*alpha summary/ });

async function loadAndSearch() {
  render(<VectorMemoryPanel />);
  await screen.findByText('Xenova/all-MiniLM-L6-v2'); // status strip rendered
  fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'alpha beta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByText('alpha summary');
}

beforeEach(() => {
  fetchCalls.length = 0;
  forgetStatus = 200;
  forgetBody = { removed: true };
  searchBodies = [];
  holdSearchResponse = false;
  holdDeleteResponse = false;
  searchGate = null;
  deleteGate = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VectorMemoryPanel inline expand', () => {
  it('collapses hits to a preview with no detail region', async () => {
    await loadAndSearch();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forget' })).toBeNull();
    expect(screen.queryByText('vm_alpha')).toBeNull();
    // Long text is truncated with an ellipsis, not rendered in full.
    expect(screen.getByText(previewText(hitsPayload.hits[0]!.text))).toBeTruthy();
  });

  it('expands a hit inline with full text and id/score fields', async () => {
    await loadAndSearch();

    fireEvent.click(alphaToggle());

    expect(screen.getByText(hitsPayload.hits[0]!.text, { exact: true, trim: false })).toBeTruthy();
    expect(screen.getByText('vm_alpha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forget' })).toBeTruthy();
  });

  it('collapses the hit on a second toggle click', async () => {
    await loadAndSearch();

    fireEvent.click(alphaToggle());
    expect(screen.getByText('vm_alpha')).toBeTruthy();

    fireEvent.click(alphaToggle());
    expect(screen.queryByText('vm_alpha')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forget' })).toBeNull();
  });
});

describe('VectorMemoryPanel forget flow', () => {
  it('confirms in a dialog before issuing the DELETE and removes the hit', async () => {
    await loadAndSearch();

    fireEvent.click(alphaToggle());
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));

    // Destructive confirmation first — no network mutation until confirmed.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(fetchCalls.some((c) => c.startsWith('DELETE'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Forget memory' }));

    await waitFor(() => {
      expect(fetchCalls).toContainEqual('DELETE /api/vector-memory/store/vm_alpha');
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Hit removed from the list; the other result remains.
    expect(screen.queryByText('vm_alpha')).toBeNull();
    expect(screen.getByText('0.704')).toBeTruthy();
  });

  it('cancel keeps the entry in the list without a DELETE', async () => {
    await loadAndSearch();

    fireEvent.click(alphaToggle());
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchCalls.some((c) => c.startsWith('DELETE'))).toBe(false);
    expect(screen.getByText('vm_alpha')).toBeTruthy();
  });

  it('shows the error in the dialog when the store refuses the forget', async () => {
    forgetStatus = 500;
    forgetBody = { error: 'Vector memory forget failed' };
    await loadAndSearch();

    fireEvent.click(alphaToggle());
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget memory' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('forget failed: HTTP 500');
    // Entry stays in the list; the dialog stays open for a retry decision.
    expect(screen.getByText('vm_alpha')).toBeTruthy();
  });
});

describe('VectorMemoryPanel disabled contract', () => {
  it('renders the placeholder with no search surface when the host wires no store', async () => {
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(200, { enabled: false })),
    );
    render(<VectorMemoryPanel />);

    await screen.findByText(/Disabled —/);
    expect(screen.queryByLabelText('Query')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('does not keep the previous host’s status when the new host fails', async () => {
    const { rerender } = render(<VectorMemoryPanel baseUrl="/host-a" />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2'); // host A status loaded

    // Host B's status request fails — the panel must show the error state,
    // not host A's provider/paths/counts.
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.reject(new Error('status failed: HTTP 502')),
    );
    rerender(<VectorMemoryPanel baseUrl="/host-b" />);

    expect(await screen.findByText(/Status unavailable/)).toBeTruthy();
    expect(screen.queryByText('Xenova/all-MiniLM-L6-v2')).toBeNull();
  });
});

describe('VectorMemoryPanel forget/search interleaving', () => {
  it('a search landing during an in-flight forget wins; the stale patch is rejected', async () => {
    const gammaHit = {
      id: 'vm_gamma',
      score: 0.555,
      text: 'Gamma entry — new result set.',
      summary: 'gamma summary',
      tags: [],
    };
    await loadAndSearch(); // search 1: alpha + beta (version 1)

    // Fire search 2 (same query — changing the query now clears the page)
    // and hold its response — the list still shows alpha/beta.
    holdSearchResponse = true;
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    // Confirm a forget of alpha while search 2 is in flight; hold the DELETE.
    holdDeleteResponse = true;
    fireEvent.click(alphaToggle());
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget memory' }));
    expect(fetchCalls).toContainEqual('DELETE /api/vector-memory/store/vm_alpha');

    // Search 2 lands with a brand-new result set — the version bumps.
    await act(async () => {
      searchGate?.({ hits: [gammaHit], count: 1 });
    });
    expect(await screen.findByText('gamma summary')).toBeTruthy();

    // The DELETE resolves last: its snapshot belongs to the pre-search result
    // set, so the version guard must reject the patch instead of slicing
    // gamma's hit list / similarity matrix with stale indices.
    await act(async () => {
      deleteGate?.({ removed: true });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('gamma summary')).toBeTruthy(); // untouched
    expect(screen.queryByRole('button', { name: /0\.912/ })).toBeNull(); // old set replaced
    // The successful forget still bumps statusNonce → one extra status fetch.
    const statusCalls = fetchCalls.filter((c) => c.endsWith('/api/vector-memory/status'));
    expect(statusCalls.length).toBe(2);
  });
});

describe('VectorMemoryPanel cursor pagination', () => {
  const pageOne = {
    hits: [hitsPayload.hits[0], hitsPayload.hits[1]],
    count: 2,
    nextCursor: 'rank_tok_1',
    similarity: [
      [1.0, 0.2],
      [0.2, 1.0],
    ],
  };
  const pageTwo = {
    hits: [
      {
        id: 'vm_gamma',
        score: 0.555,
        text: 'Gamma entry — page two.',
        summary: 'gamma summary',
        tags: [],
      },
    ],
    count: 1,
    nextCursor: null,
  };

  it('appends the next page via the cursor token and stops at exhaustion', async () => {
    searchBodies.push(pageOne, pageTwo);
    render(<VectorMemoryPanel />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'alpha beta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('alpha summary');

    // Full page → the server emitted a rank cursor → Load more is offered.
    const loadMore = screen.getByRole('button', { name: 'Load more' });
    expect((loadMore as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(loadMore);

    await screen.findByText('gamma summary');
    // The page-two request carried the opaque cursor from page one.
    const secondSearch = fetchCalls.filter((c) => c.includes('/api/vector-memory/search')).at(-1);
    expect(secondSearch).toContain('cursor=rank_tok_1');
    // Appended, not replaced: page-one hits remain ranked above the new one.
    expect(screen.getByText('alpha summary')).toBeTruthy();
    expect(screen.getByText('#3')).toBeTruthy();
    // Exhausted result set (nextCursor null) → no further page offered.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    // The similarity heatmap only covers the top page — appending drops it
    // instead of showing a matrix misaligned with the grown hit list.
    expect(screen.queryByTestId('vector-memory-heatmap')).toBeNull();
  });

  it('clears hits and cursor when a ranking input changes after a search', async () => {
    searchBodies.push(pageOne);
    render(<VectorMemoryPanel />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'alpha beta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('alpha summary');
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();

    // limit change → the page (hits + cursor) is invalidated…
    fireEvent.change(screen.getByLabelText('limit'), { target: { value: '20' } });
    expect(screen.queryByText('alpha summary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    // …and the empty list is NOT reported as "No results." before a search ran.
    expect(screen.queryByText('No results.')).toBeNull();

    // threshold change clears a committed page as well.
    searchBodies.push(pageOne);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('alpha summary');
    fireEvent.change(screen.getByLabelText('threshold'), { target: { value: '0.5' } });
    expect(screen.queryByText('alpha summary')).toBeNull();

    // query change clears too (typed locally or swapped in by a parent).
    searchBodies.push(pageOne);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('alpha summary');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'zzz' } });
    expect(screen.queryByText('alpha summary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});

describe('VectorMemoryPanel stale response guard', () => {
  it('a late-landing older response never overwrites a newer one', async () => {
    const gammaOnly = {
      hits: [
        {
          id: 'vm_gamma',
          score: 0.555,
          text: 'Gamma entry — newer response.',
          summary: 'gamma summary',
          tags: [],
        },
      ],
      count: 1,
      nextCursor: null,
    };
    render(<VectorMemoryPanel />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'alpha beta' } });

    // Search 1 fires and its response is held (slow network).
    holdSearchResponse = true;
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    // Search 2 fires while 1 is in flight (Enter still works while the
    // button shows Searching…) and resolves first with a different set.
    searchBodies.push(gammaOnly);
    fireEvent.keyDown(screen.getByLabelText('Query'), { key: 'Enter' });
    expect(await screen.findByText('gamma summary')).toBeTruthy();

    // Search 1 lands LAST — the guard must discard it, not clobber search 2.
    await act(async () => {
      searchGate?.(hitsPayload);
    });
    expect(screen.getByText('gamma summary')).toBeTruthy();
    expect(screen.queryByText('alpha summary')).toBeNull();
  });
});

describe('VectorMemoryPanel shared search (MemoryManager lens)', () => {
  function makeShared(overrides: Partial<SharedMemorySearch> = {}): SharedMemorySearch {
    return {
      query: 'shared term',
      setQuery: vi.fn(),
      statusFilter: 'all',
      setStatusFilter: vi.fn(),
      kindFilter: 'all',
      setKindFilter: vi.fn(),
      navigateToSage: vi.fn(),
      ...overrides,
    };
  }

  it('searches with the shared query and forwards edits through setQuery', async () => {
    const shared = makeShared();
    render(<VectorMemoryPanel sharedSearch={shared} />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');

    // The input is driven by the shared query — no local echo state.
    expect((screen.getByLabelText('Query') as HTMLInputElement).value).toBe('shared term');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'edited' } });
    expect(shared.setQuery).toHaveBeenCalledWith('edited');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('alpha summary');
    const searchCall = fetchCalls.find((c) => c.includes('/api/vector-memory/search'));
    expect(searchCall).toContain('q=shared+term');
  });

  it('renders provenance badges and navigates verified sage hits', async () => {
    searchBodies.push({
      hits: [
        {
          id: 'vm_prov1',
          score: 0.81,
          text: 'Provenance one.',
          summary: 'prov one',
          tags: ['alpha'],
          kind: 'fact',
          scope: 'project',
          sage: { id: 'sage_1', status: 'verified' },
        },
        {
          id: 'vm_prov2',
          score: 0.62,
          text: 'Provenance two.',
          kind: 'note',
          scope: 'project',
          tags: [],
        },
      ],
      count: 2,
      nextCursor: null,
    });
    const shared = makeShared();
    render(<VectorMemoryPanel sharedSearch={shared} />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('prov one');

    // Ranked provenance badges: rank, kind, scope per hit.
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByText('kind fact')).toBeTruthy();
    expect(screen.getByText('kind note')).toBeTruthy();
    expect(screen.getAllByText('scope project').length).toBe(2);
    // Verified mirror: badge + navigation for exactly the linked hit.
    expect(screen.getAllByText('sage verified').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open in SAGE' }));
    expect(shared.navigateToSage).toHaveBeenCalledWith('sage_1');
    // Unlinked hit exposes no SAGE navigation.
    expect(screen.getAllByRole('button', { name: 'Open in SAGE' }).length).toBe(1);
  });

  it('shows a verified badge without navigation when running standalone', async () => {
    searchBodies.push({
      hits: [
        {
          id: 'vm_prov1',
          score: 0.81,
          text: 'Provenance one.',
          tags: [],
          sage: { id: 'sage_1', status: 'verified' },
        },
      ],
      count: 1,
      nextCursor: null,
    });
    render(<VectorMemoryPanel />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'prov' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('sage verified');
    // No shared lens → provenance is still shown, but not clickable.
    expect(screen.queryByRole('button', { name: 'Open in SAGE' })).toBeNull();
  });

  it('disables search with an explicit notice while the shared status filter is active', async () => {
    const shared = makeShared({ statusFilter: 'active' });
    render(<VectorMemoryPanel sharedSearch={shared} />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');

    const notice = screen.getByTestId('vm-unsupported-filters');
    expect(notice.textContent).toContain('status "active"');
    expect(notice.textContent).toContain('cannot apply the active SAGE filter');

    const searchButton = screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement;
    expect(searchButton.disabled).toBe(true);
    // Enter in the query box must not bypass the block — no silent filter.
    fireEvent.keyDown(screen.getByLabelText('Query'), { key: 'Enter' });
    expect(fetchCalls.some((c) => c.includes('/api/vector-memory/search'))).toBe(false);
  });

  it('disables search with an explicit notice while the shared kind filter is active', async () => {
    const shared = makeShared({ kindFilter: 'decision' });
    render(<VectorMemoryPanel sharedSearch={shared} />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');

    const notice = screen.getByTestId('vm-unsupported-filters');
    expect(notice.textContent).toContain('kind "decision"');
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('names both filters when status and kind are active together', async () => {
    const shared = makeShared({ statusFilter: 'stale', kindFilter: 'fact' });
    render(<VectorMemoryPanel sharedSearch={shared} />);
    await screen.findByText('Xenova/all-MiniLM-L6-v2');

    const notice = screen.getByTestId('vm-unsupported-filters');
    expect(notice.textContent).toContain('status "stale"');
    expect(notice.textContent).toContain('kind "fact"');
    expect(notice.textContent).toContain('filters');
  });
});

describe('previewText', () => {
  it('truncates long text with an ellipsis and keeps short text intact', () => {
    const long = 'word '.repeat(100);
    expect(previewText(long).endsWith('…')).toBe(true);
    expect(previewText(long).length).toBeLessThanOrEqual(170);
    expect(previewText('short')).toBe('short');
  });
});

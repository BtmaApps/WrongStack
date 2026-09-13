import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { State } from '../src/app-reducer.js';
import { useInputHistoryPersistence } from '../src/hooks/use-input-history-persistence.js';
import { Text } from '../src/ink.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// We need to mock the core modules that useInputHistoryPersistence imports
vi.mock('@wrongstack/core/storage', () => {
  const mockStore = {
    _entries: [] as string[],
    load: vi.fn(async function (this: typeof mockStore) {
      return this._entries;
    }),
    save: vi.fn(async () => undefined),
  };
  return {
    // biome-ignore lint/complexity/useArrowFunction: constructed with `new`; an arrow impl throws.
    InputHistoryStore: vi.fn(function () {
      return mockStore;
    }),
    INPUT_HISTORY_DEFAULT_MAX: 100,
  };
});

// Both classes are constructed with `new` in the hook: an arrow-function mock
// throws "is not a constructor" (vitest 5), which silently turned every
// mount-path test into a no-op (the hook never reached load/save). Keep the
// `function` impls — biome's useArrowFunction fix reintroduces the bug.
vi.mock('@wrongstack/core/security', () => ({
  // biome-ignore lint/complexity/useArrowFunction: constructed with `new`; an arrow impl throws.
  DefaultSecretScrubber: vi.fn(function () {
    return { scrub: (s: string) => s };
  }),
}));

vi.mock('@wrongstack/core/utils', () => {
  return {
    resolveWstackPaths: vi.fn(() => ({ projectInputHistory: '/fake/path/history.json' })),
  };
});

interface HarnessRefs {
  projectRoot: string;
  inputHistory: State['inputHistory'];
  dispatch: Mock;
}

function buildHarness(): HarnessRefs {
  return {
    projectRoot: '/test/project',
    inputHistory: [
      { displayText: 'hello', blocks: [] as never[] },
    ] as unknown as State['inputHistory'],
    dispatch: vi.fn(),
  };
}

function Harness({ refs }: { refs: HarnessRefs }): React.ReactElement {
  useInputHistoryPersistence({
    projectRoot: refs.projectRoot,
    inputHistory: refs.inputHistory,
    dispatch: refs.dispatch,
  });
  return React.createElement(Text, null, 'hist');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('useInputHistoryPersistence', () => {
  it('does nothing when projectRoot is empty', () => {
    const refs = buildHarness();
    refs.projectRoot = '';
    expect(() => render(React.createElement(Harness, { refs }))).not.toThrow();
  });

  // Install a fresh store per test: the file-level afterEach restores mocks,
  // which wipes the shared factory store's implementations between tests.
  // (The old load test also set entries AFTER mount and asserted nothing.)
  const installStore = async (entries: unknown[]) => {
    const { InputHistoryStore } = await import('@wrongstack/core/storage');
    const store = {
      load: vi.fn(async () => entries),
      save: vi.fn(async () => undefined),
    };
    // biome-ignore lint/complexity/useArrowFunction: constructed with `new`; an arrow impl throws.
    (InputHistoryStore as unknown as Mock).mockImplementation(function () {
      return store;
    });
    return store;
  };

  it('loads history on mount and dispatches entries', async () => {
    const store = await installStore(['entry1', 'entry2']);
    const refs = buildHarness();
    render(React.createElement(Harness, { refs }));
    await vi.waitFor(() =>
      expect(refs.dispatch).toHaveBeenCalledWith({
        type: 'setInputHistory',
        entries: ['entry1', 'entry2'],
      }),
    );
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch when loaded entries are empty', async () => {
    const store = await installStore([]);
    const refs = buildHarness();
    render(React.createElement(Harness, { refs }));
    await vi.waitFor(() => expect(store.load).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    // No setInputHistory dispatch
    expect(refs.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'setInputHistory' }),
    );
  });

  it('saves history on change with debounce', async () => {
    const store = await installStore([]);
    const refs = buildHarness();
    const view = render(React.createElement(Harness, { refs }));
    await vi.waitFor(() => expect(store.load).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    const next = [
      { displayText: 'new', blocks: [] as never[] },
    ] as unknown as State['inputHistory'];
    view.rerender(React.createElement(Harness, { refs: { ...refs, inputHistory: next } }));
    // Debounced: nothing is written immediately.
    expect(store.save).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(store.save).toHaveBeenCalledWith(next), { timeout: 1_000 });
    expect(store.save).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('skips save when snapshot matches last saved', async () => {
    const store = await installStore([]);
    const refs = buildHarness();
    const view = render(React.createElement(Harness, { refs }));
    await vi.waitFor(() => expect(store.load).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    // Re-render with the same inputHistory reference: no change, no write.
    view.rerender(React.createElement(Harness, { refs }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(store.save).not.toHaveBeenCalled();
    view.unmount();
  });

  it('handles load error gracefully', async () => {
    const { InputHistoryStore } = await import('@wrongstack/core/storage');
    const store = {
      load: vi.fn(async () => {
        throw new Error('load error');
      }),
      save: vi.fn(async () => undefined),
    };
    // biome-ignore lint/complexity/useArrowFunction: constructed with `new`; an arrow impl throws.
    (InputHistoryStore as unknown as Mock).mockImplementation(function () {
      return store;
    });
    const refs = buildHarness();
    const view = render(React.createElement(Harness, { refs }));
    await vi.waitFor(() => expect(store.load).toHaveBeenCalled());
    expect(view.lastFrame()).toBe('hist');
    expect(refs.dispatch).not.toHaveBeenCalled();
    view.unmount();
  });
});

// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModelCatalog } from '../src/hooks/use-model-catalog.js';
import type { ModelDescriptor, SessionInfo } from '../src/types.js';

/**
 * PR-4 safety net for `useModelCatalog`. The hook was extracted from
 * `app.tsx`'s model catalog state, selectModel/confirmModelSwitch handlers,
 * and the pending smaller-context warning lifecycle.
 *
 * Coverage:
 *  - groupedModels filters empty providers
 *  - selectedModel is tab-separated provider\tmodel (or '' when no session)
 *  - selectModel noop (same model) → no send
 *  - selectModel send (larger/equal context) → model.switch frame
 *  - selectModel warn (smaller context) → pending set, no send
 *  - confirmModelSwitch → send + clear pending
 *  - running auto-clears pending
 *  - Escape clears pending
 *  - requestProviderModels dedup
 */

interface MockSocket {
  send: ReturnType<typeof vi.fn>;
}

interface Captured {
  current: ReturnType<typeof useModelCatalog>;
}

function makeSession(provider = 'openai', model = 'gpt-4o'): SessionInfo {
  return {
    id: 'sess-1',
    provider,
    model,
    projectName: 'Test',
    cwd: '/test',
    maxContext: 128_000,
  };
}

function makeModels(): Record<string, ModelDescriptor[]> {
  return {
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128_000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', contextWindow: 16_000 },
    ],
    anthropic: [{ id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200_000 }],
    empty: [],
  };
}

function renderHookViaRoot(
  captured: Captured,
  options: {
    session?: SessionInfo | null;
    contextMaxContext?: number;
    running?: boolean;
    requestedModels?: string[];
  },
): { root: Root; socket: MockSocket; requestedModelsRef: { current: Set<string> } } {
  const socket: MockSocket = { send: vi.fn() };
  const requestedModelsRef = {
    current: new Set(options.requestedModels ?? []),
  };

  function Probe(): null {
    captured.current = useModelCatalog({
      session: options.session === undefined ? makeSession() : options.session,
      contextMaxContext: options.contextMaxContext ?? 128_000,
      running: options.running ?? false,
      socketRef: { current: socket as never },
      requestedModelsRef,
    });
    return null;
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  return { root, socket, requestedModelsRef };
}

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('useModelCatalog — derived values', () => {
  it('filters empty providers from groupedModels', () => {
    const captured: Captured = { current: undefined as never };
    const { root } = renderHookViaRoot(captured, {});

    act(() => captured.current.setModels(makeModels()));
    const providers = captured.current.groupedModels.map(([p]) => p);
    expect(providers).toEqual(['openai', 'anthropic']);
    expect(providers).not.toContain('empty');
    roots.push(root);
  });

  it('selectedModel is "" when no session', () => {
    const captured: Captured = { current: undefined as never };
    const { root } = renderHookViaRoot(captured, { session: null });
    expect(captured.current.selectedModel).toBe('');
    roots.push(root);
  });

  it('selectedModel is "provider\\tmodel" when session exists', () => {
    const captured: Captured = { current: undefined as never };
    const { root } = renderHookViaRoot(captured, {});
    expect(captured.current.selectedModel).toBe('openai\tgpt-4o');
    roots.push(root);
  });
});

describe('useModelCatalog — selectModel', () => {
  it('does nothing when selecting the same model (noop)', () => {
    const captured: Captured = { current: undefined as never };
    const { root, socket } = renderHookViaRoot(captured, {});

    act(() => captured.current.setModels(makeModels()));
    act(() => captured.current.selectModel('openai', 'gpt-4o'));
    expect(socket.send).not.toHaveBeenCalled();
    roots.push(root);
  });

  it('sends model.switch immediately for a larger/equal context model', () => {
    const captured: Captured = { current: undefined as never };
    const { root, socket } = renderHookViaRoot(captured, {});

    act(() => captured.current.setModels(makeModels()));
    act(() => captured.current.selectModel('anthropic', 'claude-3.5-sonnet'));
    expect(socket.send).toHaveBeenCalledWith('model.switch', {
      provider: 'anthropic',
      model: 'claude-3.5-sonnet',
    });
    expect(captured.current.pendingModelSwitch).toBeNull();
    roots.push(root);
  });

  it('sets pendingModelSwitch (no send) for a smaller context model', () => {
    const captured: Captured = { current: undefined as never };
    const { root, socket } = renderHookViaRoot(captured, {});

    act(() => captured.current.setModels(makeModels()));
    act(() => captured.current.selectModel('openai', 'gpt-4o-mini'));
    expect(socket.send).not.toHaveBeenCalled();
    expect(captured.current.pendingModelSwitch).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      modelName: 'GPT-4o mini',
      currentWindow: 128_000,
      nextWindow: 16_000,
    });
    roots.push(root);
  });
});

describe('useModelCatalog — confirmModelSwitch', () => {
  it('sends model.switch and clears pending', () => {
    const captured: Captured = { current: undefined as never };
    const { root, socket } = renderHookViaRoot(captured, {});

    act(() => captured.current.setModels(makeModels()));
    act(() => captured.current.selectModel('openai', 'gpt-4o-mini'));
    expect(captured.current.pendingModelSwitch).not.toBeNull();

    act(() => captured.current.confirmModelSwitch());
    expect(socket.send).toHaveBeenCalledWith('model.switch', {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(captured.current.pendingModelSwitch).toBeNull();
    roots.push(root);
  });

  it('sends model.switch exactly once under StrictMode (no side effect in the updater)', () => {
    const captured: Captured = { current: undefined as never };
    const socket: MockSocket = { send: vi.fn() };
    const requestedModelsRef = { current: new Set<string>() };

    function Probe(): null {
      captured.current = useModelCatalog({
        session: makeSession(),
        contextMaxContext: 128_000,
        running: false,
        socketRef: { current: socket as never },
        requestedModelsRef,
      });
      return null;
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() =>
      root.render(
        <StrictMode>
          <Probe />
        </StrictMode>,
      ),
    );

    act(() => captured.current.setModels(makeModels()));
    act(() => captured.current.selectModel('openai', 'gpt-4o-mini'));
    expect(captured.current.pendingModelSwitch).not.toBeNull();

    // StrictMode double-invokes state updaters in dev builds. The old
    // implementation sent `model.switch` from inside the updater and fired
    // twice here; the send must now live outside it.
    act(() => captured.current.confirmModelSwitch());
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith('model.switch', {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(captured.current.pendingModelSwitch).toBeNull();
  });
});

describe('useModelCatalog — pending lifecycle', () => {
  it('auto-clears pending when running becomes true', () => {
    const captured: Captured = { current: undefined as never };
    const { root } = renderHookViaRoot(captured, { running: true });

    act(() => captured.current.setModels(makeModels()));
    act(() => captured.current.selectModel('openai', 'gpt-4o-mini'));

    // With running=true, the effect auto-clears pending on the next tick.
    expect(captured.current.pendingModelSwitch).toBeNull();
    roots.push(root);
  });

  it('clears pending on Escape keydown', () => {
    const captured: Captured = { current: undefined as never };
    const { root } = renderHookViaRoot(captured, {});

    act(() => captured.current.setModels(makeModels()));
    // Wait for re-render so selectModel sees updated models.
    act(() => captured.current.selectModel('openai', 'gpt-4o-mini'));
    expect(captured.current.pendingModelSwitch).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(captured.current.pendingModelSwitch).toBeNull();
    roots.push(root);
  });
});

describe('useModelCatalog — requestProviderModels', () => {
  it('sends provider.models only once per provider', () => {
    const captured: Captured = { current: undefined as never };
    const { root, socket, requestedModelsRef } = renderHookViaRoot(captured, {});

    act(() => captured.current.requestProviderModels('openai'));
    expect(socket.send).toHaveBeenCalledWith('provider.models', { providerId: 'openai' });

    act(() => captured.current.requestProviderModels('openai'));
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(requestedModelsRef.current.has('openai')).toBe(true);

    act(() => captured.current.requestProviderModels('anthropic'));
    expect(socket.send).toHaveBeenCalledTimes(2);
    roots.push(root);
  });
});

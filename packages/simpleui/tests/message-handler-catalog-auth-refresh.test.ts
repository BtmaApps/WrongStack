import { describe, expect, it, vi } from 'vitest';
import { handleProvidersSavedMessage } from '../src/lib/message-handler-catalog.js';
import type { ModelDescriptor, ServerMessage } from '../src/types.js';

describe('providers.saved auth refresh', () => {
  it('invalidates the request guard and re-fetches models for an existing provider id', () => {
    const requestedModelsRef = { current: new Set(['openai']) };
    let models: Record<string, ModelDescriptor[]> = {
      openai: [{ id: 'old-model', name: 'Old model' }],
      removed: [{ id: 'removed-model', name: 'Removed model' }],
    };
    const requestProviderModels = vi.fn((providerId: string) => {
      requestedModelsRef.current.add(providerId);
    });

    handleProvidersSavedMessage(
      {
        type: 'providers.saved',
        payload: { providers: [{ id: 'openai' }] },
      } as ServerMessage,
      {
        activeModelRef: { current: { provider: 'openai', model: 'old-model' } },
        requestedModelsRef,
        requestProviderModels,
        setModels: (
          update:
            | Record<string, ModelDescriptor[]>
            | ((current: Record<string, ModelDescriptor[]>) => Record<string, ModelDescriptor[]>),
        ) => {
          models = typeof update === 'function' ? update(models) : update;
        },
      } as never,
    );

    expect(requestProviderModels).toHaveBeenCalledOnce();
    expect(requestProviderModels).toHaveBeenCalledWith('openai');
    expect(models).toEqual({});
  });
});

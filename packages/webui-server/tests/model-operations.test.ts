import type { Context } from '@wrongstack/core/agent';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { createModelOperations } from '../src/server/model-operations.js';

function harness(
  options: {
    runActive?: boolean;
    activeSessionId?: string;
    liveSessionId?: string;
    fail?: boolean;
  } = {},
) {
  const context = {
    model: 'old-model',
    provider: { id: 'old-provider' },
  } as never as Context;
  const sent: Array<{ type: string; payload: unknown }> = [];
  const broadcasts: Array<{ type: string; payload: unknown }> = [];
  const applyModelSwitch = vi.fn(async (provider: string, model: string) => {
    if (options.fail) throw new Error('provider unavailable');
    context.provider = { id: provider } as Context['provider'];
    context.model = model;
  });
  const isRunActive = vi.fn((sessionId?: string) =>
    options.activeSessionId ? sessionId === options.activeSessionId : (options.runActive ?? false),
  );
  const operations = createModelOperations({
    context,
    getConfig: () => undefined,
    getLiveProviderId: () => context.provider.id,
    buildProvider: () => context.provider,
    applyModelSwitch,
    isRunActive,
    ...(options.liveSessionId
      ? {
          getSessionContext: (sessionId?: string) =>
            sessionId === options.liveSessionId ? context : undefined,
        }
      : {}),
    send: (_ws, message) => sent.push(message),
    broadcast: (message) => broadcasts.push(message),
  });
  return {
    context,
    sent,
    broadcasts,
    applyModelSwitch,
    isRunActive,
    switchModel: (payload: unknown) => operations.switchModel({} as WebSocket, payload),
    refineModel: (payload: Parameters<typeof operations.refineModel>[1]) =>
      operations.refineModel({} as WebSocket, payload),
  };
}

describe('model switch lifecycle', () => {
  it('broadcasts a correlated success with the activation boundary', async () => {
    const h = harness({ runActive: true });

    await h.switchModel({
      provider: 'new-provider',
      model: 'new-model',
      requestId: 'switch-1',
    });

    expect(h.sent).toEqual([]);
    expect(h.broadcasts).toEqual([
      {
        type: 'model.switch_result',
        payload: {
          requestId: 'switch-1',
          success: true,
          message: 'Switched to new-provider / new-model',
          provider: 'new-provider',
          model: 'new-model',
          previousProvider: 'old-provider',
          previousModel: 'old-model',
          runActive: true,
        },
      },
    ]);
  });

  it('sends failure only to the requester and preserves the previous identity', async () => {
    const h = harness({ fail: true });

    await h.switchModel({
      provider: 'bad-provider',
      model: 'bad-model',
      requestId: 'switch-2',
    });

    expect(h.broadcasts).toEqual([]);
    expect(h.context.provider.id).toBe('old-provider');
    expect(h.context.model).toBe('old-model');
    expect(h.sent).toEqual([
      {
        type: 'model.switch_result',
        payload: expect.objectContaining({
          requestId: 'switch-2',
          success: false,
          previousProvider: 'old-provider',
          previousModel: 'old-model',
          runActive: false,
        }),
      },
    ]);
  });

  it('correlates and session-stamps validation failures', async () => {
    const h = harness({ activeSessionId: 'session-B' });

    await h.switchModel({
      provider: 'openai',
      model: '',
      requestId: 'switch-invalid',
      sessionId: 'session-B',
    });

    expect(h.applyModelSwitch).not.toHaveBeenCalled();
    expect(h.isRunActive).toHaveBeenCalledWith('session-B');
    expect(h.sent).toContainEqual({
      type: 'model.switch_result',
      payload: {
        requestId: 'switch-invalid',
        sessionId: 'session-B',
        success: false,
        message: 'model.switch payload.model must be a non-empty string',
        runActive: true,
      },
    });
  });

  it('returns a correlated failure when a named session is no longer live', async () => {
    const h = harness({ liveSessionId: 'session-live' });

    await h.switchModel({
      provider: 'openai',
      model: 'gpt-missing',
      requestId: 'switch-missing',
      sessionId: 'session-gone',
    });

    expect(h.applyModelSwitch).not.toHaveBeenCalled();
    expect(h.broadcasts).toEqual([]);
    expect(h.sent).toContainEqual({
      type: 'model.switch_result',
      payload: {
        requestId: 'switch-missing',
        sessionId: 'session-gone',
        success: false,
        message:
          'Session session-gone is not live in this runtime. Reopen or resume the tab, then retry.',
        runActive: false,
      },
    });
  });

  it('returns a refine result when a named refinement session is no longer live', async () => {
    const h = harness({ liveSessionId: 'session-live' });

    await h.refineModel({
      text: 'Please refine this prompt',
      sessionId: 'session-gone',
    });

    expect(h.sent).toContainEqual({
      type: 'model.refine_result',
      payload: {
        sessionId: 'session-gone',
        refined: 'Please refine this prompt',
        english: 'Please refine this prompt',
        error:
          'Session session-gone is not live in this runtime. Reopen or resume the tab, then retry.',
        errorKind: 'provider_error',
      },
    });
  });

  it('keeps the legacy result only for clients without request correlation', async () => {
    const h = harness();

    await h.switchModel({ provider: 'simple-provider', model: 'simple-model' });

    expect(h.broadcasts[0]).toMatchObject({
      type: 'model.switch_result',
      payload: { success: true, provider: 'simple-provider', model: 'simple-model' },
    });
    expect(h.sent).toEqual([
      {
        type: 'key.operation_result',
        payload: {
          success: true,
          message: 'Switched to simple-provider / simple-model',
        },
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { resumeSession } from '../../src/boot/tui-session-resume.js';

function writer(id: string) {
  return { id, append: async () => undefined, close: async () => undefined };
}

async function scenario(options: {
  switchProvider?: (providerId: string, model: string) => Promise<string | undefined>;
  savedProvider: string;
  savedModel: string;
}) {
  const oldWriter = writer('sess_old');
  const resumedWriter = writer('sess_resumed');
  const context = {
    session: oldWriter as never,
    messages: [{ role: 'user', content: 'old' }],
    model: 'old-model',
    meta: {} as Record<string, unknown>,
    provider: { id: 'old-provider', capabilities: { maxContext: 1000 } },
    traceId: 'trace',
    state: {
      todos: [],
      meta: {} as Record<string, unknown>,
      replaceMessages(messages: unknown[]) {
        context.messages = messages as typeof context.messages;
      },
      replaceTodos() {
        return undefined;
      },
      setMeta(key: string, value: unknown) {
        this.meta[key] = value;
      },
    },
    flushConversationJournal: async () => undefined,
  };
  const result = await resumeSession(
    {
      state: {
        projectRoot: '/project',
        wpaths: { projectSessions: '/sessions' },
        activeSessionStore: {
          resolveId: async (id: string) => id,
          resume: async () => ({
            writer: resumedWriter,
            data: {
              metadata: {
                id: resumedWriter.id,
                provider: options.savedProvider,
                model: options.savedModel,
              },
              messages: [{ role: 'user', content: 'resumed' }],
              events: [],
              usage: { input: 1, output: 1 },
            },
          }),
          load: async () => {
            throw new Error('load should not run');
          },
        },
        activateSessionIdentity: async () => undefined,
        detachActiveTodosCheckpoint: async () => undefined,
      },
      agent: { ctx: context },
      tokenCounter: {
        total: () => ({ input: 0, output: 0 }),
        reset() {
          return undefined;
        },
        account() {
          return undefined;
        },
        setCurrentRequestTokens() {
          return undefined;
        },
      },
      ...(options.switchProvider ? { switchProviderAndModel: options.switchProvider } : {}),
      events: {
        emit() {
          return undefined;
        },
      },
    } as never,
    resumedWriter.id,
  );
  return { result, providerId: context.provider.id, model: context.model };
}

describe('resumeSession — saved route restoration', () => {
  it('refuses to pair a mismatched saved model with current provider when no switch callback exists', async () => {
    const mixed = await scenario({ savedProvider: 'saved-provider', savedModel: 'saved-model' });
    expect(mixed.result?.attached).toBe(true);
    expect(mixed.providerId).toBe('old-provider');
    expect(mixed.model).toBe('old-model');
    expect(mixed.result?.warnings.join('\n')).toContain(
      'could not restore saved route without a provider switch',
    );
  });

  it('restores same-provider model update when provider id matches', async () => {
    const same = await scenario({
      savedProvider: 'old-provider',
      savedModel: 'same-provider-model',
    });
    expect(same.result?.attached).toBe(true);
    expect(same.providerId).toBe('old-provider');
    expect(same.model).toBe('same-provider-model');
    expect(same.result?.warnings).toEqual([]);
  });

  it('delegates to switchProviderAndModel when provided', async () => {
    let switchedProvider = '';
    let switchedModel = '';
    const delegated = await scenario({
      savedProvider: 'other-provider',
      savedModel: 'other-model',
      switchProvider: async (p, m) => {
        switchedProvider = p;
        switchedModel = m;
        return undefined;
      },
    });
    expect(delegated.result?.attached).toBe(true);
    expect(switchedProvider).toBe('other-provider');
    expect(switchedModel).toBe('other-model');
  });
});

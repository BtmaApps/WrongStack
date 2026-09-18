import type {
  ClientCapabilities,
  ContentBlock,
  RunTurn,
  RunTurnResult,
  SessionConfigOption,
  SessionMode,
  SessionPersistence,
  SessionState,
} from './protocol-contract.js';
import {
  createRunTurnApi,
  DEFAULT_MODE_ID,
  errorToJsonRpc,
  parseMcpServers,
  resolveSessionCwd,
} from './protocol-session-ops.js';

export interface ProtocolSessionContext {
  sessions: Map<string, SessionState>;
  maxSessions: number;
  defaultCwd: string;
  modes: readonly SessionMode[];
  configOptions: readonly SessionConfigOption[];
  store: SessionPersistence | undefined;
  replayFor:
    | ((sessionId: string) => Array<{ sessionUpdate: string; content: unknown }>)
    | undefined;
  seedFor:
    | ((sessionId: string, history: Array<{ sessionUpdate: string; content: unknown }>) => void)
    | undefined;
  disposeFor?: ((sessionId: string) => void) | undefined;
  onSessionNew: (state: SessionState) => void;
  allocId: () => string;
  persist: (
    state: SessionState,
    history?: Array<{ sessionUpdate: string; content: unknown }>,
  ) => Promise<void>;
  sendNotification: (params: unknown) => Promise<void>;
  sendError: (id: string | number, code: number, message: string, data?: unknown) => Promise<void>;
  sendResult: (id: string | number, result: unknown) => Promise<void>;
  request: (method: string, params: unknown, timeoutMs?: number) => Promise<unknown>;
  runTurn: RunTurn;
  clientCapabilities: ClientCapabilities;
}

export async function handleSessionNewOp(
  ctx: ProtocolSessionContext,
  id: string | number,
  params: unknown,
): Promise<boolean> {
  if (ctx.sessions.size >= ctx.maxSessions) {
    await ctx.sendError(id, -32000, `active session limit reached (${ctx.maxSessions})`);
    return false;
  }
  const p = (params ?? {}) as { cwd?: unknown; mcpServers?: unknown };
  let cwd = ctx.defaultCwd;
  if (typeof p.cwd === 'string') {
    const resolved = await resolveSessionCwd(p.cwd);
    if (resolved === null) {
      await ctx.sendError(id, -32602, `cwd must be an absolute path to an existing directory`);
      return false;
    }
    cwd = resolved;
  }
  const skipped: string[] = [];
  const mcpServers = parseMcpServers(p.mcpServers, (reason) => skipped.push(reason));
  const sessionId = `sess_${ctx.allocId()}`;
  const now = new Date().toISOString();
  const state: SessionState = {
    id: sessionId,
    cwd,
    abort: new AbortController(),
    modeId: ctx.modes[0]?.id ?? DEFAULT_MODE_ID,
    configOptions: structuredClone([...ctx.configOptions]),
    createdAt: now,
    updatedAt: now,
    ...(mcpServers.length > 0 ? { mcpServers } : {}),
  };
  ctx.sessions.set(sessionId, state);
  ctx.onSessionNew(state);
  await ctx.persist(state);

  await ctx.sendNotification({
    sessionId,
    update: {
      sessionUpdate: 'current_mode_update',
      modeId: ctx.modes[0]?.id ?? DEFAULT_MODE_ID,
    },
  });
  if (ctx.configOptions.length > 0) {
    await ctx.sendNotification({
      sessionId,
      update: {
        sessionUpdate: 'config_option_update',
        configOptions: [...ctx.configOptions],
      },
    });
  }
  await reportSkippedMcpServers(ctx, sessionId, skipped);

  await ctx.sendResult(id, {
    sessionId,
    modes: { currentModeId: state.modeId, availableModes: ctx.modes },
    configOptions: state.configOptions,
  });
  return false;
}

export async function handleSessionLoadOp(
  ctx: ProtocolSessionContext,
  id: string | number,
  params: unknown,
  replayHistory = true,
): Promise<boolean> {
  const p = (params ?? {}) as { sessionId?: unknown; cwd?: unknown; mcpServers?: unknown };
  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : null;
  const loadCwd = typeof p.cwd === 'string' ? p.cwd : undefined;
  const loadSkipped: string[] = [];
  const loadMcpServers = parseMcpServers(p.mcpServers, (reason) => loadSkipped.push(reason));
  const existing = sessionId ? ctx.sessions.get(sessionId) : undefined;

  if (!existing && sessionId && ctx.store) {
    const persisted = await ctx.store.load(sessionId);
    if (persisted) {
      if (ctx.sessions.size >= ctx.maxSessions) {
        await ctx.sendError(id, -32000, `active session limit reached (${ctx.maxSessions})`);
        return false;
      }
      if (loadCwd !== undefined && (await resolveSessionCwd(loadCwd)) === null) {
        await ctx.sendError(id, -32602, `cwd must be an absolute path to an existing directory`);
        return false;
      }
      const candidateCwd = persisted.cwd ?? loadCwd ?? ctx.defaultCwd;
      const restoredCwd = (await resolveSessionCwd(candidateCwd)) ?? ctx.defaultCwd;
      const restored: SessionState = {
        id: sessionId,
        cwd: restoredCwd,
        abort: new AbortController(),
        modeId: persisted.modeId ?? DEFAULT_MODE_ID,
        configOptions: structuredClone(persisted.configOptions ?? [...ctx.configOptions]),
        createdAt: persisted.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(persisted.title !== undefined ? { title: persisted.title } : {}),
        ...(loadMcpServers.length > 0 ? { mcpServers: loadMcpServers } : {}),
      };
      ctx.sessions.set(sessionId, restored);
      ctx.seedFor?.(sessionId, persisted.history ?? []);
      for (const update of replayHistory ? (persisted.history ?? []) : []) {
        await ctx.sendNotification({ sessionId, update });
      }
      if (replayHistory)
        await ctx.sendNotification({
          sessionId,
          update: { sessionUpdate: 'current_mode_update', modeId: restored.modeId },
        });
      await reportSkippedMcpServers(ctx, sessionId, loadSkipped);
      await ctx.sendResult(id, {
        modes: { currentModeId: restored.modeId, availableModes: ctx.modes },
        configOptions: restored.configOptions,
      });
      return false;
    }
  }

  if (existing) {
    if (existing.prompting) {
      await ctx.sendError(id, -32000, 'cannot reload a session while a prompt is running');
      return false;
    }
    existing.updatedAt = new Date().toISOString();
    const replay = ctx.replayFor?.(sessionId!);
    // A warm `session/load` carries the client's current server set; honour it
    // so a client that added a server since `session/new` is not stuck with
    // the old list. An explicit empty array clears the client's server set.
    if (Array.isArray(p.mcpServers)) {
      if (JSON.stringify(existing.mcpServers ?? []) !== JSON.stringify(loadMcpServers)) {
        ctx.disposeFor?.(sessionId!);
        ctx.seedFor?.(sessionId!, replay ?? []);
      }
      existing.mcpServers = loadMcpServers;
    }
    if (replayHistory && replay) {
      for (const update of replay) {
        await ctx.sendNotification({ sessionId, update });
      }
    }
    if (replayHistory)
      await ctx.sendNotification({
        sessionId,
        update: {
          sessionUpdate: 'session_info_update',
          updatedAt: existing.updatedAt,
        },
      });
    if (replayHistory)
      await ctx.sendNotification({
        sessionId,
        update: {
          sessionUpdate: 'current_mode_update',
          modeId: existing.modeId,
        },
      });
    await reportSkippedMcpServers(ctx, sessionId!, loadSkipped);
    await ctx.sendResult(id, {
      modes: {
        currentModeId: existing.modeId,
        availableModes: ctx.modes,
      },
      configOptions: existing.configOptions ?? [...ctx.configOptions],
    });
    return false;
  }

  await ctx.sendError(id, -32000, `session not found: ${sessionId}`);
  return false;
}

export async function handleSessionForkOp(
  ctx: ProtocolSessionContext,
  id: string | number,
  params: unknown,
): Promise<boolean> {
  const p = (params ?? {}) as { sessionId?: unknown; cwd?: unknown; mcpServers?: unknown };
  const sourceId = typeof p.sessionId === 'string' ? p.sessionId : null;
  const source = sourceId ? ctx.sessions.get(sourceId) : undefined;
  if (!sourceId || !source) {
    await ctx.sendError(id, -32000, `session not found: ${sourceId}`);
    return false;
  }
  if (ctx.sessions.size >= ctx.maxSessions) {
    await ctx.sendError(id, -32000, `active session limit reached (${ctx.maxSessions})`);
    return false;
  }

  let forkCwd = source.cwd;
  if (typeof p.cwd === 'string') {
    const resolved = await resolveSessionCwd(p.cwd);
    if (resolved === null) {
      await ctx.sendError(id, -32602, `cwd must be an absolute path to an existing directory`);
      return false;
    }
    forkCwd = resolved;
  }
  const forkSkipped: string[] = [];
  const forkRequested = parseMcpServers(p.mcpServers, (reason) => forkSkipped.push(reason));
  // A fork inherits the source session's servers unless the client names its
  // own set — the fork is a continuation, and dropping the parent's tools
  // would silently change what the agent can do mid-conversation.
  const forkMcpServers = forkRequested.length > 0 ? forkRequested : source.mcpServers;

  const now = new Date().toISOString();
  const sessionId = `sess_${ctx.allocId()}`;
  const forked: SessionState = {
    id: sessionId,
    cwd: forkCwd,
    abort: new AbortController(),
    modeId: source.modeId,
    configOptions: structuredClone(source.configOptions ?? [...ctx.configOptions]),
    createdAt: now,
    updatedAt: now,
    ...(source.title !== undefined ? { title: source.title } : {}),
    ...(forkMcpServers && forkMcpServers.length > 0 ? { mcpServers: forkMcpServers } : {}),
  };
  const history = (ctx.replayFor?.(sourceId) ?? []).map((update) => ({
    sessionUpdate: update.sessionUpdate,
    content: structuredClone(update.content),
  }));
  ctx.sessions.set(sessionId, forked);
  ctx.seedFor?.(sessionId, history);
  ctx.onSessionNew(forked);
  await ctx.persist(forked, history);

  await ctx.sendNotification({
    sessionId,
    update: { sessionUpdate: 'current_mode_update', modeId: forked.modeId },
  });
  await reportSkippedMcpServers(ctx, sessionId, forkSkipped);
  await ctx.sendResult(id, {
    sessionId,
    modes: { currentModeId: forked.modeId, availableModes: ctx.modes },
    configOptions: forked.configOptions,
  });
  return false;
}

export async function handleSessionPromptOp(
  ctx: ProtocolSessionContext,
  id: string | number,
  params: unknown,
): Promise<boolean> {
  const p = (params ?? {}) as { sessionId?: unknown; prompt?: unknown };
  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : null;
  if (!sessionId || !ctx.sessions.has(sessionId)) {
    await ctx.sendError(id, -32000, 'unknown or missing sessionId');
    return false;
  }
  if (!Array.isArray(p.prompt)) {
    await ctx.sendError(id, -32602, 'prompt must be an array of content blocks');
    return false;
  }
  const session = ctx.sessions.get(sessionId)!;
  if (session.prompting) {
    await ctx.sendError(id, -32000, 'a prompt is already running for this session');
    return false;
  }
  session.prompting = true;

  if (session.abort.signal.aborted) {
    session.abort = new AbortController();
  }

  const turnSignal = new AbortController();
  const onCancel = (): void => turnSignal.abort();
  session.abort.signal.addEventListener('abort', onCancel, { once: true });

  const api = createRunTurnApi(
    sessionId,
    ctx.clientCapabilities ?? {},
    (method, req) => ctx.request(method, req),
    async (update) => {
      // Unprompted updates outlive this turn. Identity (not just the id) is
      // checked so nothing reaches a client for a session it closed, deleted,
      // or replaced with a fresh `session/load` state.
      if (ctx.sessions.get(sessionId) !== session) return false;
      await ctx.sendNotification({ sessionId, update });
      return true;
    },
  );

  let result: RunTurnResult;
  const pendingNotifications: Array<Promise<void>> = [];
  const emit = (update: unknown): void => {
    const notifPromise = ctx.sendNotification({ sessionId, update });
    pendingNotifications.push(notifPromise.catch(() => {}));
  };
  try {
    result = await ctx.runTurn(
      {
        sessionId,
        prompt: p.prompt as ContentBlock[],
        modeId: session.modeId,
        configOptions: session.configOptions,
        signal: turnSignal.signal,
        cwd: session.cwd,
        ...(session.mcpServers ? { mcpServers: session.mcpServers } : {}),
      },
      emit,
      api,
    );
  } catch (err) {
    session.prompting = false;
    session.abort.signal.removeEventListener('abort', onCancel);
    await Promise.all(pendingNotifications);
    if (turnSignal.signal.aborted) {
      await ctx.sendResult(id, { stopReason: 'cancelled' });
      return false;
    }
    const { code, message, data } = errorToJsonRpc(err);
    await ctx.sendError(id, code, message, data);
    return false;
  }

  await Promise.all(pendingNotifications);
  session.prompting = false;
  session.abort.signal.removeEventListener('abort', onCancel);
  session.updatedAt = new Date().toISOString();
  if (ctx.sessions.get(sessionId) === session) await ctx.persist(session);

  await ctx.sendResult(id, {
    stopReason: turnSignal.signal.aborted ? 'cancelled' : result.stopReason,
  });
  return false;
}

export async function handleSetModeOp(
  ctx: ProtocolSessionContext,
  id: string | number,
  params: unknown,
): Promise<boolean> {
  const p = (params ?? {}) as { sessionId?: unknown; modeId?: unknown };
  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : null;
  const modeId = typeof p.modeId === 'string' ? p.modeId : null;
  const session = sessionId ? ctx.sessions.get(sessionId) : undefined;
  if (!session || !modeId || !ctx.modes.some((m) => m.id === modeId)) {
    await ctx.sendError(id, -32602, 'invalid sessionId or modeId');
    return false;
  }
  session.modeId = modeId;
  session.updatedAt = new Date().toISOString();
  await ctx.sendNotification({
    sessionId,
    update: { sessionUpdate: 'current_mode_update', modeId },
  });
  await ctx.sendResult(id, {});
  return false;
}

export async function handleSetConfigOptionOp(
  ctx: ProtocolSessionContext,
  id: string | number,
  params: unknown,
): Promise<boolean> {
  const p = (params ?? {}) as { sessionId?: unknown; configId?: unknown; value?: unknown };
  const sessionId = typeof p.sessionId === 'string' ? p.sessionId : null;
  const optionId = typeof p.configId === 'string' ? p.configId : null;
  const value = typeof p.value === 'string' ? p.value : null;
  const session = sessionId ? ctx.sessions.get(sessionId) : undefined;
  const options = session?.configOptions ?? structuredClone([...ctx.configOptions]);
  const option = optionId ? options.find((o) => o.id === optionId) : undefined;
  if (!session || !option || value === null || !option.options.some((o) => o.value === value)) {
    await ctx.sendError(id, -32602, 'invalid sessionId, configId, or value');
    return false;
  }
  option.currentValue = value;
  session.configOptions = options;
  session.updatedAt = new Date().toISOString();
  await ctx.sendNotification({
    sessionId,
    update: {
      sessionUpdate: 'config_option_update',
      configOptions: options,
    },
  });
  await ctx.persist(session);
  await ctx.sendResult(id, { configOptions: options });
  return false;
}

/**
 * Tell the client about MCP server entries we refused to connect.
 *
 * `parseMcpServers` drops malformed entries so one bad config cannot fail the
 * whole session, but dropping without saying so is how an editor ends up
 * believing it has tools it does not have. Best-effort: a notification failure
 * must not fail `session/new`.
 */
async function reportSkippedMcpServers(
  ctx: ProtocolSessionContext,
  sessionId: string,
  skipped: readonly string[],
): Promise<void> {
  if (skipped.length === 0) return;
  try {
    await ctx.sendNotification({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: `Ignored ${skipped.length} malformed mcpServers entr${
            skipped.length === 1 ? 'y' : 'ies'
          }: ${skipped.join('; ')}`,
        },
      },
    });
  } catch {
    // best-effort
  }
}

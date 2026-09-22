/**
 * ACPSession — v1-correct ACP client.
 *
 * Owns one child process running an ACP-supporting agent (Claude Code,
 * Gemini CLI, Codex CLI, etc.) and translates the wire protocol into
 * a `SubagentRunner`-shaped surface for the rest of WrongStack.
 *
 * Spec: https://agentclientprotocol.com/protocol/v1/overview
 * Design: see ./acp-session.design.md in this directory.
 */
import { type ACPClientTransport, ClientTransport } from '../agent/stdio-transport.js';
import type { ACPMessage } from '../types/acp-messages.js';
import {
  ACP_PROTOCOL_VERSION,
  type AgentCapabilities,
  type AuthMethod,
  type ContentBlock,
  type McpServer,
  type SessionId,
  type SessionInfo,
  type StopReason,
} from '../types/acp-v1.js';
import { ACP_PACKAGE_VERSION } from '../version.js';
import { cancelLateAcpSession } from './acp-late-session.js';
import { isBestEffortAckMethod } from './acp-message-routing.js';
import type { PendingRequest, State } from './acp-request-state.js';
import {
  type AcpSessionAuthHost,
  authenticate as delegateAuthenticate,
  createSessionWithAuth as delegateCreateSessionWithAuth,
  ensureAuthenticated as delegateEnsureAuthenticated,
  logout as delegateLogout,
} from './acp-session-auth.js';
import {
  type ACPCallbackOptions,
  type ACPResponseSender,
  handleAcpFsRequest,
  handleAcpPermissionRequest,
  handleAcpTerminalRequest,
} from './acp-session-callbacks.js';
import { emptyRunResult } from './acp-session-content.js';
import { ACPSessionError, isJsonRpcError } from './acp-session-errors.js';
import {
  type ACPSessionOpContext,
  executeDeleteSession,
  executeDisableProvider,
  executeForkSession,
  executeListProviders,
  executeListSessions,
  executeLoadSession,
  executeMcpMessage,
  executeResumeSession,
  executeSetConfigOption,
  executeSetMode,
  executeSetProvider,
} from './acp-session-ops.js';
import type {
  ACPProgressEvent,
  ACPProgressHandler,
  ACPSessionOptions,
  ACPSessionRunResult,
} from './acp-session-types.js';
import {
  type ACPSessionScratch,
  createSessionScratch,
  handleAcpSessionUpdate,
} from './acp-session-updates.js';
import { FileServer } from './file-server.js';
import { type PermissionPolicy, readOnlyPermissionPolicy } from './permission.js';
import { TerminalServer } from './terminal-server.js';
import { makeTrustBoundaryPermissionPolicy } from './trust-boundary-permission.js';
import {
  WebSocketClientTransport,
  type WebSocketClientTransportOptions,
} from './websocket-transport.js';

export { audioContent, imageContent, textContent } from './acp-session-content.js';
export { ACPSessionError } from './acp-session-errors.js';
export type {
  ACPCapturedDiff,
  ACPCapturedToolCall,
  ACPProgressEvent,
  ACPProgressHandler,
  ACPSessionErrorKind,
  ACPSessionOptions,
  ACPSessionRunResult,
} from './acp-session-types.js';

export class ACPSession {
  private readonly transport: ACPClientTransport;
  private readonly fileServer: FileServer;
  private readonly terminalServer: TerminalServer;
  private readonly permissionPolicy: PermissionPolicy;
  private readonly timeoutMs: number;
  private readonly opts: ACPSessionOptions;
  private transportOff: (() => void) | null = null;
  private readonly callbackAbort = new AbortController();
  private promptCallbackAbort: AbortController | null = null;

  private state: State = 'init';
  private sessionId: SessionId | null = null;
  /** Pending outbound requests (initialize, session/new, session/prompt, etc). */
  private readonly pending = new Map<string | number, PendingRequest>();
  private nextId = 1;
  /** True after close() has been called. */
  private closed = false;

  // Agent-provided info from the initialize handshake
  private agentCapabilities: AgentCapabilities = {};
  private agentInfo: { name: string; title?: string | undefined; version: string } | null = null;
  private authMethods: AuthMethod[] = [];
  /** Protocol version negotiated with the agent during initialize. */
  private negotiatedVersion: number = ACP_PROTOCOL_VERSION;

  private constructor(opts: ACPSessionOptions, transport: ACPClientTransport) {
    this.opts = opts;
    this.transport = transport;
    this.timeoutMs = opts.timeoutMs ?? 5 * 60_000;
    const fsOpts: ConstructorParameters<typeof FileServer>[0] = {
      projectRoot: opts.projectRoot,
    };
    if (opts.fsTimeoutMs !== undefined) fsOpts.timeoutMs = opts.fsTimeoutMs;
    this.fileServer = new FileServer(fsOpts);
    const termOpts: ConstructorParameters<typeof TerminalServer>[0] = {
      projectRoot: opts.projectRoot,
    };
    if (opts.terminalTimeoutMs !== undefined) {
      termOpts.commandTimeoutMs = opts.terminalTimeoutMs;
    }
    if (opts.terminalOutputByteLimit !== undefined) {
      termOpts.outputByteLimit = opts.terminalOutputByteLimit;
    }
    if (opts.terminalMaxCount !== undefined) {
      termOpts.maxTerminals = opts.terminalMaxCount;
    }
    this.terminalServer = new TerminalServer(termOpts);
    if (opts.permissionPolicy && opts.trustBoundary) {
      throw new TypeError('permissionPolicy and trustBoundary are mutually exclusive');
    }
    this.permissionPolicy = opts.trustBoundary
      ? makeTrustBoundaryPermissionPolicy({
          boundary: opts.trustBoundary,
          ...(opts.trustActor ? { actor: opts.trustActor } : {}),
          scope: opts.trustScope ?? { cwd: opts.projectRoot },
          ...(opts.trustAuthContext ? { authContext: opts.trustAuthContext } : {}),
        })
      : (opts.permissionPolicy ?? readOnlyPermissionPolicy);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Public accessors
  // ──────────────────────────────────────────────────────────────────────

  /** Agent capabilities advertised during initialize. */
  getCapabilities(): AgentCapabilities {
    return { ...this.agentCapabilities };
  }

  /** Authentication methods advertised by the agent. */
  getAuthMethods(): AuthMethod[] {
    return [...this.authMethods];
  }

  /** Agent info (name, title, version) from initialize. */
  getAgentInfo(): { name: string; title?: string | undefined; version: string } | null {
    return this.agentInfo;
  }

  /** Whether the agent requires authentication (has auth methods). */
  requiresAuth(): boolean {
    return this.authMethods.length > 0;
  }

  /** Current session id, if one exists. */
  getSessionId(): SessionId | null {
    return this.sessionId;
  }

  /** Protocol version negotiated during initialize. */
  getNegotiatedVersion(): number {
    return this.negotiatedVersion;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Lifecycle — start
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Spawn the child, run the initialize handshake, install the
   * message dispatch, and return a ready session.
   */
  static async start(opts: ACPSessionOptions): Promise<ACPSession> {
    const transportOpts: ConstructorParameters<typeof ClientTransport>[0] = {
      command: opts.command,
      args: opts.args ? [...opts.args] : [],
      handshakeTimeoutMs: 30_000,
      skipHandshakeMarker: true,
    };
    if (opts.env !== undefined) transportOpts.env = opts.env;
    if (opts.cwd !== undefined) transportOpts.cwd = opts.cwd;
    const transport = new ClientTransport(transportOpts);
    try {
      return await ACPSession.attach(opts, transport, `failed to spawn ${opts.command}`);
    } catch (err) {
      try {
        transport.stop();
        /* v8 ignore next 3 - defensive catch around stop */
      } catch {
        // best effort
      }
      throw err;
    }
  }

  /**
   * Connect to a REMOTE ACP agent over a WebSocket instead of spawning a
   * local subprocess. `opts.command` is ignored for the wire (a label is
   * still useful for `role`); everything else (projectRoot sandbox for
   * fs/terminal, timeouts, permission policy, MCP servers) applies the same.
   */
  static async connectWebSocket(
    wsOpts: WebSocketClientTransportOptions,
    opts: ACPSessionOptions,
  ): Promise<ACPSession> {
    const transport = new WebSocketClientTransport(wsOpts);
    return ACPSession.attach(opts, transport, `failed to connect to ${wsOpts.url}`);
  }

  /**
   * Connect using a caller-supplied transport. Lets advanced callers plug
   * in their own wire (SDK streams, in-process pipes, test doubles).
   */
  static async connect(
    transport: ACPClientTransport,
    opts: ACPSessionOptions,
  ): Promise<ACPSession> {
    return ACPSession.attach(opts, transport, 'failed to connect transport');
  }

  /** Shared connect path: start the transport, install dispatch, handshake. */
  private static async attach(
    opts: ACPSessionOptions,
    transport: ACPClientTransport,
    spawnErrLabel: string,
  ): Promise<ACPSession> {
    try {
      await transport.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ACPSessionError('spawn_failed', `${spawnErrLabel}: ${msg}`, err);
    }

    const session = new ACPSession(opts, transport);
    session.transportOff = transport.onMessage((msg) => session.handleMessage(msg));

    try {
      await session.initialize();
    } catch (err) {
      session.transportOff?.();
      session.transportOff = null;
      try {
        transport.stop();
        /* v8 ignore next 3 - defensive catch around stop */
      } catch {
        // best effort
      }
      throw err;
    }
    return session;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    const id = this.allocId();
    const result = await this.sendRequest(id, 'initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'wrongstack', title: 'WrongStack', version: ACP_PACKAGE_VERSION },
    });
    if (isJsonRpcError(result)) {
      throw new ACPSessionError('init_failed', `initialize failed: ${result.message}`, result);
    }
    if (
      typeof result !== 'object' ||
      result === null ||
      typeof (result as { protocolVersion?: unknown }).protocolVersion !== 'number'
    ) {
      throw new ACPSessionError('protocol_error', 'initialize returned no protocolVersion');
    }
    const r = result as {
      protocolVersion: number;
      agentCapabilities?: AgentCapabilities;
      agentInfo?: { name: string; title?: string | undefined; version: string };
      authMethods?: AuthMethod[];
    };
    if (r.protocolVersion !== ACP_PROTOCOL_VERSION) {
      throw new ACPSessionError(
        'unsupported_capability',
        `agent requires protocolVersion=${r.protocolVersion}, client supports up to ${ACP_PROTOCOL_VERSION}`,
      );
    }
    this.negotiatedVersion = r.protocolVersion;
    this.agentCapabilities = r.agentCapabilities ?? {};
    this.agentInfo = r.agentInfo ?? null;
    this.authMethods = r.authMethods ?? [];
    this.state = 'ready';
  }

  // ──────────────────────────────────────────────────────────────────────
  // Authentication
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Authenticate with the agent using one of the advertised auth methods.
   * Call this AFTER start() and BEFORE any session/new call.
   */
  async authenticate(methodId: string): Promise<void> {
    return delegateAuthenticate(this.acpSessionAuthHost(), methodId);
  }

  /**
   * Log out from the current authenticated session.
   * Only callable if the agent advertises `auth.logout` capability.
   */
  async logout(): Promise<void> {
    return delegateLogout(this.acpSessionAuthHost());
  }

  // ──────────────────────────────────────────────────────────────────────
  // Session management delegation
  // ──────────────────────────────────────────────────────────────────────

  private opContext(): ACPSessionOpContext {
    const self = this;
    return {
      closed: this.closed,
      get sessionId() {
        return self.sessionId;
      },
      agentCapabilities: this.agentCapabilities,
      opts: this.opts,
      allocId: () => this.allocId(),
      sendRequest: (id, method, params, timeoutMs) =>
        this.sendRequest(id, method, params, timeoutMs),
      setSessionId: (id) => {
        this.sessionId = id;
      },
      resetScratch: () => this.resetScratch(),
      closeSession: () => this.closeSession(),
    };
  }

  async loadSession(sessionId: SessionId, mcpServers?: McpServer[], cwd?: string): Promise<void> {
    return executeLoadSession(this.opContext(), sessionId, mcpServers, cwd);
  }

  async resumeSession(sessionId: SessionId, mcpServers?: McpServer[], cwd?: string): Promise<void> {
    return executeResumeSession(this.opContext(), sessionId, mcpServers, cwd);
  }

  async listSessions(
    cursor?: string,
    cwd?: string,
  ): Promise<{ sessions: SessionInfo[]; nextCursor?: string | undefined }> {
    return executeListSessions(this.opContext(), cursor, cwd);
  }

  async deleteSession(sessionId: SessionId): Promise<void> {
    return executeDeleteSession(this.opContext(), sessionId);
  }

  async forkSession(
    sourceSessionId: SessionId,
    cwd?: string,
    mcpServers?: McpServer[],
  ): Promise<SessionId> {
    return executeForkSession(this.opContext(), sourceSessionId, cwd, mcpServers);
  }

  async setMode(sessionId: SessionId, modeId: string): Promise<void> {
    return executeSetMode(this.opContext(), sessionId, modeId);
  }

  async setConfigOption(sessionId: SessionId, configId: string, value: string): Promise<void> {
    return executeSetConfigOption(this.opContext(), sessionId, configId, value);
  }

  async listProviders(): Promise<{ providers: unknown[]; currentProviderId: string | null }> {
    return executeListProviders(this.opContext());
  }

  async mcpMessage(connectionId: string, message: Record<string, unknown>): Promise<unknown> {
    return executeMcpMessage(this.opContext(), connectionId, message);
  }

  async setProvider(providerId: string, config?: Record<string, unknown>): Promise<void> {
    return executeSetProvider(this.opContext(), providerId, config);
  }

  async disableProvider(): Promise<void> {
    return executeDisableProvider(this.opContext());
  }

  // ──────────────────────────────────────────────────────────────────────
  // Prompt
  // ──────────────────────────────────────────────────────────────────────

  async prompt(
    blocks: ContentBlock[],
    signal: AbortSignal,
    onProgress?: ACPProgressHandler,
  ): Promise<ACPSessionRunResult> {
    if (this.closed) {
      throw new ACPSessionError('closed', 'session is closed');
    }
    if (this.state !== 'ready' && this.state !== 'authenticated' && this.state !== 'done') {
      throw new ACPSessionError('protocol_error', `prompt called in state=${this.state}`);
    }

    if (signal.aborted) {
      return emptyRunResult('cancelled');
    }

    const caps = this.agentCapabilities.promptCapabilities;
    for (const block of blocks) {
      const supported =
        block.type === 'image'
          ? caps?.image
          : block.type === 'audio'
            ? caps?.audio
            : block.type === 'resource'
              ? caps?.embeddedContext
              : true;
      if (supported !== true) {
        throw new ACPSessionError(
          'unsupported_capability',
          `agent does not support ${block.type} prompt content`,
        );
      }
    }

    // Declared early so the onAbort closure captures it (must be before
    // onAbort is defined — TDZ: const/let declarations are hoisted but
    // accessing before the line throws ReferenceError in ESM strict mode).
    let cancelled = false;

    // Create the local abort controller BEFORE the first await so that any
    // abort (user cancellation or session error) fires the listener below
    // regardless of timing. Previously this was created after createSession
    // WithAuth — an abort landing during that await was silently lost because
    // the listener hadn't been registered yet.
    this.promptCallbackAbort = new AbortController();
    const onAbort = (): void => {
      cancelled = true;
      this.promptCallbackAbort?.abort();
      if (this.sessionId) {
        this.transport
          .send({
            jsonrpc: '2.0',
            method: 'session/cancel',
            params: { sessionId: this.sessionId },
          } as never as ACPMessage)
          .catch(() => {});
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    // Abort rejectors for the two raced phases below. Both are removed on
    // every exit path so run() never leaks a listener on the caller's signal.
    let rejectCreate: ((err: ACPSessionError) => void) | undefined;
    const onCreateAbort = (): void => {
      // With no session yet there is nothing for onAbort to cancel — drop it
      // so the catch below returns the clean cancelled result.
      signal.removeEventListener('abort', onAbort);
      rejectCreate?.(new ACPSessionError('aborted', 'prompt was aborted by the parent'));
    };

    if (!this.sessionId) {
      // Race: if abort fires during session creation, reject immediately.
      // Do NOT assign this.sessionId here — we use a local variable so the
      // catch block can tell "aborted before session existed" from "other error".
      // (If we assigned first and the race rejected, catch would try sendRequest
      // with a valid-looking sessionId that was never confirmed by the server.)
      let sessionId: string;
      // Keep the creation promise: if the abort rejection wins the race, the
      // server-side session/new may still complete afterwards. The late
      // arrival is cancelled below instead of being orphaned on the server.
      const createPromise = this.createSessionWithAuth();
      try {
        sessionId = await Promise.race([
          createPromise,
          new Promise<never>((_, reject) => {
            rejectCreate = reject;
            // Defensive: a listener registered on an already-aborted signal
            // never fires, so an abort that landed inside the synchronous
            // prefix above must reject here explicitly — otherwise the race
            // would hang on createPromise, ignoring the cancellation.
            if (signal.aborted) {
              reject(new ACPSessionError('aborted', 'prompt was aborted by the parent'));
              return;
            }
            signal.addEventListener('abort', onCreateAbort, { once: true });
          }),
        ]);
      } catch (err) {
        // Abort won the race — the session was never adopted on our side, but
        // it may still be created server-side (cancelled below). Return a
        // clean cancelled result without calling sendRequest for the run (it
        // would throw protocol_error since this.sessionId was never set).
        // Listener teardown and controller release run here: this catch exits
        // before the turn-phase finally below ever executes — including the
        // non-abort re-throw path, so onAbort detaches here too (a no-op
        // when onCreateAbort already removed it).
        signal.removeEventListener('abort', onAbort);
        signal.removeEventListener('abort', onCreateAbort);
        rejectCreate = undefined;
        this.promptCallbackAbort?.abort();
        this.promptCallbackAbort = null;
        if (err instanceof ACPSessionError && err.kind === 'aborted') {
          // Best-effort: if the abandoned creation still completes, cancel
          // the late session so it does not leak server-side. The cancel is
          // a bounded notification send; failures surface on the warn
          // channel (cancelLateSession) instead of being swallowed.
          this.cancelLateSession(createPromise);
          return emptyRunResult('cancelled');
        }
        throw err;
      }
      signal.removeEventListener('abort', onCreateAbort);
      rejectCreate = undefined;
      // Per the ACP spec the session id is an opaque, non-empty string. This
      // is the wire trust boundary — validate before branding instead of
      // blindly casting whatever session/new returned.
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        // This throw sits between the two cleanup owners (the create-phase
        // catch above and the turn-phase finally below), and neither runs
        // for it: detach onAbort (it never fired on this path) and release
        // the controller here, or every prompt() against a misbehaving
        // agent leaks the listener — and the eventual abort fires it
        // against whatever prompt is live at that time.
        signal.removeEventListener('abort', onAbort);
        this.promptCallbackAbort?.abort();
        this.promptCallbackAbort = null;
        throw new ACPSessionError('protocol_error', 'session/new returned no session id');
      }
      this.sessionId = sessionId as SessionId;
    }

    // Guard: an abort that raced session creation. session/new already went
    // out and the id was adopted above; whether a matching session/cancel
    // followed depends on when onAbort ran (it skips the wire send while the
    // id is unassigned). Either way the turn is over — the adopted id stays
    // for the next prompt() to reuse, and close() ends the session.
    if (signal.aborted) {
      return emptyRunResult('cancelled');
    }

    this.resetScratch();
    this.progressHandler = onProgress ?? null;

    const promptId = this.allocId();
    // Race the prompt request against the abort signal: if abort fires
    // mid-turn, onTurnAbort rejects the race so the await surfaces a clean
    // cancellation instead of the in-flight request's result — the
    // session/cancel itself goes out from onAbort. The rejector handle is
    // nullable so onTurnAbort is a no-op once the race has settled and the
    // finally below has torn the listener down.
    let rejectTurn: ((err: ACPSessionError) => void) | undefined;
    const onTurnAbort = (): void => {
      rejectTurn?.(new ACPSessionError('aborted', 'prompt was aborted by the parent'));
    };
    signal.addEventListener('abort', onTurnAbort, { once: true });
    const turnPromise = Promise.race([
      this.sendRequest(
        promptId,
        'session/prompt',
        {
          sessionId: this.sessionId,
          prompt: blocks,
        },
        this.timeoutMs,
      ),
      new Promise<never>((_, reject) => {
        rejectTurn = reject;
      }),
    ]);

    this.state = 'prompting';
    let response: unknown;
    try {
      response = await turnPromise;
    } catch (err) {
      // Every failure ends this turn: the session must land in 'done' (which
      // the entry guard admits for the next prompt), not stay stuck in
      // 'prompting' — that would brick the session after one transient
      // transport error.
      this.state = 'done';
      // `cancelled` means the outer onAbort fired during sendRequest; an
      // aborted-kind error means the inner race rejector won. Both are clean
      // cancellations, not protocol failures — return the cancelled result
      // and let the `finally` below own the listener/callback teardown.
      const abortedKind = err instanceof ACPSessionError && err.kind === 'aborted';
      if (cancelled || abortedKind) {
        return emptyRunResult('cancelled');
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (signal.aborted) {
        // The signal aborted concurrently with a real sendRequest failure;
        // report the cancellation but keep the original error as the cause
        // instead of masking it.
        throw new ACPSessionError('aborted', 'prompt was aborted by the parent', err);
      }
      throw new ACPSessionError('prompt_failed', `session/prompt failed: ${msg}`, err);
    } finally {
      signal.removeEventListener('abort', onAbort);
      signal.removeEventListener('abort', onTurnAbort);
      signal.removeEventListener('abort', onCreateAbort);
      rejectTurn = undefined;
      rejectCreate = undefined;
      this.promptCallbackAbort?.abort();
      this.promptCallbackAbort = null;
      this.progressHandler = null;
    }

    this.state = 'done';
    if (isJsonRpcError(response)) {
      throw new ACPSessionError('prompt_failed', `agent error: ${response.message}`, response);
    }
    const stopReason = (response as { stopReason?: StopReason }).stopReason ?? 'end_turn';
    const finalText = this.scratch.text;
    return {
      text: finalText,
      stopReason,
      hasText: finalText.length > 0,
      usage: this.scratch.usage,
      plan: this.scratch.plan,
      toolCalls: [...this.scratch.toolCalls.values()],
      diffs: this.scratch.diffs,
      thoughts: this.scratch.thoughts,
    };
  }

  /**
   * Best-effort cancel for a session the server confirmed after we already
   * stopped waiting (the abort-during-creation race). `session/cancel` is a
   * JSON-RPC notification — the server sends no response, so this is a bare
   * transport send bounded by a timer rather than sendRequest, whose
   * pending-tracking would just expire waiting for a reply that never
   * comes. A failure or timeout is surfaced on the warn channel instead of
   * being silently swallowed.
   */
  private cancelLateSession(createPromise: Promise<SessionId>): void {
    cancelLateAcpSession(this.transport, createPromise);
  }

  private async closeSession(): Promise<void> {
    if (!this.sessionId) return;
    const sid = this.sessionId;
    this.sessionId = null;

    if (this.agentCapabilities.sessionCapabilities?.close) {
      const id = this.allocId();
      try {
        await this.sendRequest(id, 'session/close', { sessionId: sid }, 10_000);
        /* v8 ignore next 3 - best-effort close request */
      } catch {
        // Best-effort
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Lifecycle — close
  // ──────────────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.state = 'closed';
    this.callbackAbort.abort();
    this.promptCallbackAbort?.abort();
    this.promptCallbackAbort = null;
    this.terminalServer.dispose();

    if (this.sessionId && this.agentCapabilities.sessionCapabilities?.close) {
      try {
        await this.closeSession();
        /* v8 ignore next 3 - best-effort close on teardown */
      } catch {
        // best-effort
      }
    }

    for (const [, p] of this.pending) {
      clearTimeout(p.timeoutHandle);
      p.reject(new ACPSessionError('closed', 'session was closed'));
    }
    this.pending.clear();
    this.transportOff?.();
    this.transportOff = null;
    try {
      this.transport.stop();
    } catch {
      // best effort
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Wire layer
  // ────────────────────────────────────────────────────────────────────

  private allocId(): number {
    let candidate = Number.isSafeInteger(this.nextId) && this.nextId >= 1 ? this.nextId : 1;
    // Probe at most pending.size + 1 distinct ids: among that many candidates
    // at least one cannot be occupied by the current pending set. This keeps
    // ids precise after MAX_SAFE_INTEGER and avoids overwriting a long-running
    // request that still owns a low id after rollover.
    for (let probe = 0; probe <= this.pending.size; probe++) {
      this.nextId = candidate >= Number.MAX_SAFE_INTEGER ? 1 : candidate + 1;
      if (!this.pending.has(candidate)) return candidate;
      candidate = this.nextId;
    }
    throw new ACPSessionError('protocol_error', 'no JSON-RPC request id is available');
  }

  private async sendRequest(
    id: number,
    method: string,
    params: unknown,
    timeoutMs?: number,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const effectiveTimeout = timeoutMs ?? this.timeoutMs;
      const handle = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ACPSessionError('protocol_error', `${method} timed out after ${effectiveTimeout}ms`),
        );
      }, effectiveTimeout);
      this.pending.set(id, {
        method,
        resolve: resolve as (v: unknown) => void,
        reject,
        timeoutMs: effectiveTimeout,
        timeoutHandle: handle,
      });
      this.transport
        .send({ jsonrpc: '2.0', id, method, params } as never as ACPMessage)
        .catch((err) => {
          clearTimeout(handle);
          this.pending.delete(id);
          const msg = err instanceof Error ? err.message : String(err);
          reject(new ACPSessionError('protocol_error', `send ${method} failed: ${msg}`, err));
        });
    });
  }

  /**
   * `session/new`, then one authenticate+retry if the agent demands login.
   * Logged-in CLIs succeed on the first call even when they advertise
   * `authMethods`; we do not pop OAuth on every spawn.
   */
  private async createSessionWithAuth(): Promise<SessionId> {
    return delegateCreateSessionWithAuth(this.acpSessionAuthHost());
  }

  /**
   * Pick a non-terminal auth method and run `authenticate`. Terminal-only
   * agents need an out-of-band login CLI (registry AUTHENTICATION.md) —
   * we refuse rather than hang a TUI inside the JSON-RPC child.
   */
  private async ensureAuthenticated(): Promise<void> {
    return delegateEnsureAuthenticated(this.acpSessionAuthHost());
  }

  private sendResult(id: string | number, result: unknown): Promise<void> {
    return this.transport.send({ jsonrpc: '2.0', id, result } as never as ACPMessage);
  }

  private sendErrorResponse(id: string | number, code: number, message: string): Promise<void> {
    return this.transport.send({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    } as never as ACPMessage);
  }

  private responseSender(): ACPResponseSender {
    return {
      sendResult: (id, result) => this.sendResult(id, result),
      sendErrorResponse: (id, code, message) => this.sendErrorResponse(id, code, message),
    };
  }

  private callbackOptions(): ACPCallbackOptions {
    const promptSignal = this.promptCallbackAbort?.signal;
    const signal = promptSignal
      ? AbortSignal.any([this.callbackAbort.signal, promptSignal])
      : this.callbackAbort.signal;
    return { signal, permissionTimeoutMs: Number.POSITIVE_INFINITY };
  }

  private handleMessage(msg: ACPMessage): void {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timeoutHandle);
      this.pending.delete(msg.id);
      if (msg.error !== undefined) {
        const method = pending.method;
        const kind =
          method === 'session/new'
            ? 'session_create_failed'
            : method === 'authenticate'
              ? 'auth_failed'
              : 'protocol_error';
        pending.reject(
          new ACPSessionError(kind, msg.error.message ?? 'unknown JSON-RPC error', msg.error),
        );
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if (msg.method === 'session/update') {
      handleAcpSessionUpdate(msg, this.scratch, (event) => this.emitProgress(event));
      return;
    }

    if (msg.method === 'session/request_permission') {
      handleAcpPermissionRequest(
        msg,
        this.permissionPolicy,
        this.responseSender(),
        this.callbackOptions(),
      ).catch(() => {});
      return;
    }

    if (msg.method === 'fs/read_text_file' || msg.method === 'fs/write_text_file') {
      handleAcpFsRequest(
        msg,
        this.fileServer,
        this.permissionPolicy,
        this.responseSender(),
        this.callbackOptions(),
      ).catch(() => {});
      return;
    }

    if (msg.method?.startsWith('terminal/')) {
      handleAcpTerminalRequest(
        msg,
        this.terminalServer,
        this.permissionPolicy,
        this.responseSender(),
        this.callbackOptions(),
      ).catch(() => {});
      return;
    }

    if (isBestEffortAckMethod(msg.method)) {
      if (msg.id !== undefined) {
        this.sendErrorResponse(msg.id, -32601, `Unsupported method: ${msg.method}`).catch(() => {});
      }
      return;
    }

    if (msg.method === '$/cancel_request') {
      return;
    }

    if (msg.method) {
      if (msg.id !== undefined) {
        void this.sendErrorResponse(msg.id, -32601, `Unsupported method: ${msg.method}`).catch(
          () => {},
        );
        return;
      }
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'acp_session.unhandled_method',
          method: msg.method,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private emitProgress(event: ACPProgressEvent): void {
    if (!this.progressHandler) return;
    try {
      this.progressHandler(event);
    } catch {
      // A faulty host handler must never break the wire pump.
    }
  }

  private progressHandler: ACPProgressHandler | null = null;
  private scratch: ACPSessionScratch = createSessionScratch();

  private resetScratch(): void {
    this.scratch = createSessionScratch();
  }

  private acpSessionAuthHost(): AcpSessionAuthHost {
    const self = this;
    return {
      get state() {
        return self.state;
      },
      set state(value) {
        self.state = value;
      },
      get authMethods() {
        return self.authMethods;
      },
      allocId: (...args) => this.allocId(...args),
      sendRequest: (...args) => this.sendRequest(...args),
      get agentCapabilities() {
        return self.agentCapabilities;
      },
      opContext: (...args) => this.opContext(...args),
      ensureAuthenticated: (...args) => this.ensureAuthenticated(...args),
      authenticate: (...args) => this.authenticate(...args),
      opts: this.opts,
    };
  }
}

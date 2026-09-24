import type {
  CoreClientMessage,
  CoreServerMessage,
  WSSessionStart,
  WSSessionsList,
  WSToolConfirmNeeded,
  WSUserMessageImage,
} from '@wrongstack/webui-protocol';
import { FrameResume } from '@wrongstack/webui-protocol/frame-resume';
import {
  type CloseInfo,
  type Frame,
  openSocket,
  SOCKET_OPEN,
  type WebSocketConstructor,
  type WebSocketLike,
} from './connection.js';
import { WrongStackError } from './errors.js';
import { type ConfirmDecision, RUN_EVENT_TYPES, Run, type RunEvent } from './run.js';

export type { WebSocketConstructor, WebSocketLike } from './connection.js';

/** A session as the server announced it in `session.start`. */
export type SessionInfo = WSSessionStart['payload'];
export type SessionSummary = WSSessionsList['payload']['sessions'][number];
export type ConfirmRequest = WSToolConfirmNeeded['payload'] & { sessionId: string };

export type CoreServerType = CoreServerMessage['type'];
export type ServerPayload<T extends CoreServerType> = Extract<
  CoreServerMessage,
  { type: T }
>['payload'];

/** `open`: usable. `reconnecting`: the socket dropped and a new one is being opened. `closed`: for good. */
export type ConnectionState = 'open' | 'reconnecting' | 'closed';

export interface ReconnectOptions {
  /** Attempts before giving up. Default 10. */
  attempts?: number | undefined;
  /** Wait before the first attempt, doubled after each failure. Default 500 ms. */
  initialDelayMs?: number | undefined;
  /** Longest wait between attempts. Default 10 s. */
  maxDelayMs?: number | undefined;
}

export interface ConnectOptions {
  /** The WebUI server, `http://127.0.0.1:3456` or its `ws://` form. */
  url: string;
  /** The access token (`wstack --webui` prints it; required off loopback). */
  token?: string | undefined;
  /** Defaults to the global `WebSocket` (Node 22+, browsers). */
  WebSocket?: WebSocketConstructor | undefined;
  /** How long to wait for the connection and for each request's answer. Default 15 s. */
  timeoutMs?: number | undefined;
  /**
   * Reconnect after the socket drops, and catch up on what the server sent
   * meanwhile: runs in flight keep streaming and still settle. On by default;
   * `false` makes a drop final.
   */
  reconnect?: ReconnectOptions | false | undefined;
  /**
   * Answers tool confirmations. Return a decision to send it, or nothing to
   * leave the request open for `run.confirm()` / `client.confirm()`. Without
   * a handler the requests stay open (the server's own deadline applies).
   */
  onConfirm?:
    | ((
        request: ConfirmRequest,
      ) => ConfirmDecision | undefined | Promise<ConfirmDecision | undefined>)
    | undefined;
}

export interface SendOptions {
  /** Defaults to the client's current session. */
  sessionId?: string | undefined;
  images?: WSUserMessageImage[] | undefined;
  /** Start the run on an empty provider conversation (the transcript stays). */
  freshContext?: boolean | undefined;
}

type Listener = (payload: unknown) => void;
type StateListener = (state: ConnectionState, error: WrongStackError | undefined) => void;

/** A run in flight, and the socket it was sent on. */
interface PendingRun {
  run: Run;
  socket: number;
}

/** The server keeps at most this many sessions per connection subscribed. */
const MAX_SUBSCRIBED = 4;
/** The close code `close()` sends; the server's own 1000 is a deliberate close too. */
const NORMAL_CLOSURE = 1000;

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * A connection to a WrongStack WebUI server.
 *
 * ```ts
 * const client = await WrongStackClient.connect({ url: 'http://127.0.0.1:3456', token });
 * const run = client.send('Summarise README.md');
 * for await (const event of run) {
 *   if (event.type === 'provider.text_delta') process.stdout.write(event.payload.text);
 * }
 * console.log((await run.result).status);
 * client.close();
 * ```
 */
export class WrongStackClient {
  private socket!: WebSocketLike;
  /** Counts sockets; a run remembers the one it was sent on. */
  private socketNumber = 0;
  private current!: SessionInfo;
  private epoch: string | undefined;
  private connection: ConnectionState = 'open';
  private closing = false;
  private retryTimer: { cancel(): void } | undefined;
  private readonly sessions = new Map<string, SessionInfo>();
  private subscribed: string[] = [];
  private readonly runs = new Map<string, PendingRun>();
  private readonly answeredConfirms = new Set<string>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly waiters = new Set<{
    match: (frame: Frame) => boolean;
    resolve: (frame: Frame) => void;
  }>();
  private closeError: WrongStackError | undefined;
  private readonly closeListeners = new Set<(error: WrongStackError | undefined) => void>();
  /** Orders numbered frames across a reconnect and drops the ones already applied. */
  private readonly frames = new FrameResume<Frame>((frames) => {
    for (const frame of frames) this.dispatch(frame);
  });

  private constructor(
    private readonly Ctor: WebSocketConstructor,
    private readonly options: ConnectOptions,
  ) {}

  /** Open the socket and wait for the server to announce the session. */
  static async connect(options: ConnectOptions): Promise<WrongStackClient> {
    const Ctor =
      options.WebSocket ??
      (globalThis as { WebSocket?: WebSocketConstructor | undefined }).WebSocket;
    if (!Ctor) {
      throw new WrongStackError({
        kind: 'connection',
        code: 'no_websocket',
        detail: 'No global WebSocket; pass one as options.WebSocket.',
      });
    }
    const client = new WrongStackClient(Ctor, options);
    const { start, early } = await client.open();
    client.current = start;
    client.receive({ type: 'session.start', payload: start });
    client.subscribe(start.sessionId);
    for (const frame of early) client.receive(frame);
    return client;
  }

  /** The session prompts go to unless `SendOptions.sessionId` names another. */
  get sessionId(): string {
    return this.current.sessionId;
  }

  /** The last `session.start` of the current session. */
  get session(): SessionInfo {
    return this.current;
  }

  get state(): ConnectionState {
    return this.connection;
  }

  get closed(): boolean {
    return this.connection === 'closed';
  }

  /** Send a prompt; the returned run streams its events and settles with the result. */
  send(text: string, options: SendOptions = {}): Run {
    const sessionId = options.sessionId ?? this.current.sessionId;
    const id = newId('msg');
    const run = new Run(id, sessionId, {
      abort: (target) => this.abort(target),
      confirm: (confirmId, decision) => this.confirm(confirmId, decision, sessionId),
    });
    const unusable = this.unusable();
    if (unusable) {
      run.fail(unusable);
      return run;
    }
    this.runs.set(id, { run, socket: this.socketNumber });
    if (!this.subscribed.includes(sessionId)) this.subscribe(sessionId);
    this.post({
      type: 'user_message',
      payload: {
        id,
        content: text,
        timestamp: Date.now(),
        sessionId,
        ...(options.images ? { images: options.images } : {}),
        ...(options.freshContext ? { freshContext: true } : {}),
      },
    });
    return run;
  }

  /** Stop the session's run. */
  abort(sessionId: string = this.current.sessionId): void {
    this.post({ type: 'abort', payload: { sessionId } });
  }

  /** Answer a tool confirmation. */
  confirm(id: string, decision: ConfirmDecision, sessionId?: string): void {
    this.post({
      type: 'tool.confirm_result',
      payload: { id, decision, ...(sessionId ? { sessionId } : {}) },
    });
    // Bounded: an id matters only while its request can still be re-sent.
    if (this.answeredConfirms.size >= 1_000) this.answeredConfirms.clear();
    this.answeredConfirms.add(id);
  }

  /** Recent sessions, newest first. */
  async listSessions(limit = 50): Promise<SessionSummary[]> {
    const answer = this.next((frame) => frame.type === 'sessions.list');
    this.post({ type: 'sessions.list', payload: { limit, sessionId: this.current.sessionId } });
    const payload = (await answer).payload as WSSessionsList['payload'];
    if (payload.error)
      throw new WrongStackError({ kind: 'server', code: 'sessions.list', detail: payload.error });
    return payload.sessions;
  }

  /** Open a new session and make it current. */
  async newSession(): Promise<SessionInfo> {
    const before = new Set(this.sessions.keys());
    const answer = this.next(
      (frame) =>
        frame.type === 'session.start' &&
        !before.has((frame.payload as SessionInfo | undefined)?.sessionId ?? ''),
    );
    this.post({ type: 'session.new', payload: { sessionId: this.current.sessionId } });
    return this.adopt((await answer).payload as SessionInfo);
  }

  /** Open an earlier session, with its transcript, and make it current. */
  async resumeSession(id: string): Promise<SessionInfo> {
    const answer = this.next(
      (frame) =>
        frame.type === 'session.start' &&
        (frame.payload as SessionInfo | undefined)?.sessionId === id,
    );
    this.post({ type: 'session.resume', payload: { id, sessionId: this.current.sessionId } });
    return this.adopt((await answer).payload as SessionInfo);
  }

  /**
   * Listen to a server frame type. The conversation core is typed; any other
   * type the server sends can be named too, with an `unknown` payload.
   */
  on<T extends CoreServerType>(type: T, listener: (payload: ServerPayload<T>) => void): () => void;
  on(type: string, listener: (payload: unknown) => void): () => void;
  on(type: string, listener: (payload: never) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    // The overloads pin the payload type per frame type; stored untyped.
    const untyped = listener as Listener;
    set.add(untyped);
    return () => set.delete(untyped);
  }

  /** Called on every change of `state`, with the error that caused a drop. */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Called once when the connection ends for good; `error` is unset after `close()`. */
  onClose(listener: (error: WrongStackError | undefined) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /**
   * Send any frame. The conversation core is typed; other message types
   * (see the protocol's registry) are accepted as they are.
   */
  post(message: CoreClientMessage | Frame): void {
    const unusable = this.unusable();
    if (unusable) throw unusable;
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    if (this.connection === 'closed') return;
    this.closing = true;
    if (this.connection === 'reconnecting') {
      this.retryTimer?.cancel();
      this.finish(undefined);
      return;
    }
    this.socket.close(NORMAL_CLOSURE, 'client closed');
  }

  /** Why nothing can be sent right now, if so. */
  private unusable(): WrongStackError | undefined {
    if (this.connection === 'closed') {
      return this.closeError ?? new WrongStackError({ kind: 'connection', code: 'closed' });
    }
    if (this.connection === 'reconnecting' || this.socket.readyState !== SOCKET_OPEN) {
      return new WrongStackError({
        kind: 'connection',
        code: 'reconnecting',
        detail: 'The connection dropped and is being reopened.',
        retryable: true,
      });
    }
    return undefined;
  }

  /**
   * Open a socket; returns its `session.start` and the frames that came
   * before it. A changed epoch means the server restarted: runs in flight
   * died with it.
   */
  private async open(): Promise<{ start: SessionInfo; early: Frame[] }> {
    const number = this.socketNumber + 1;
    const opened = await openSocket(
      this.Ctor,
      {
        url: this.options.url,
        token: this.options.token,
        timeoutMs: this.options.timeoutMs ?? 15_000,
      },
      {
        frame: (frame) => {
          if (number === this.socketNumber) this.receive(frame);
        },
        close: (event) => {
          if (number === this.socketNumber) this.handleClose(event);
        },
      },
    );
    this.socket = opened.socket;
    this.socketNumber = number;
    const start = opened.start;
    const restarted =
      this.epoch !== undefined && start.eventEpoch !== undefined && start.eventEpoch !== this.epoch;
    if (start.eventEpoch !== undefined) this.epoch = start.eventEpoch;
    if (restarted) {
      this.failRuns(
        () => true,
        new WrongStackError({
          kind: 'connection',
          code: 'server_restarted',
          detail: 'The server restarted while the run was in flight; the run did not survive it.',
          retryable: true,
        }),
      );
    }
    return { start, early: opened.early };
  }

  private adopt(info: SessionInfo): SessionInfo {
    this.current = info;
    this.subscribe(info.sessionId);
    return info;
  }

  /**
   * Declare the sessions this connection shows; the server sends events only
   * for those. After a reconnect the declaration carries the last frame
   * applied per session, and the server sends what was missed.
   */
  private subscribe(sessionId: string, catchUp = false): void {
    this.subscribed = [sessionId, ...this.subscribed.filter((id) => id !== sessionId)].slice(
      0,
      MAX_SUBSCRIBED,
    );
    const cursors = catchUp ? this.frames.request(this.subscribed) : null;
    this.socket.send(
      JSON.stringify({
        type: 'session.subscribe',
        payload: { sessionIds: this.subscribed, sessionId, ...(cursors ?? {}) },
      }),
    );
  }

  /** The next frame that matches, or a timeout. */
  private next(match: (frame: Frame) => boolean): Promise<Frame> {
    const timeoutMs = this.options.timeoutMs ?? 15_000;
    return new Promise<Frame>((resolve, reject) => {
      const waiter = {
        match,
        resolve: (frame: Frame) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(frame);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new WrongStackError({ kind: 'timeout', code: 'no_answer', retryable: true }));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  /** A frame off the socket: numbered ones pass the resume gate first. */
  private receive(frame: Frame): void {
    if (frame.type === 'session.start') {
      this.dispatch(this.frames.onSessionStart(frame));
      return;
    }
    if (frame.type === 'session.frames_resumed') {
      this.frames.onFramesResumed(frame);
      this.dispatch(frame);
      return;
    }
    for (const accepted of this.frames.gate.accept(frame)) this.dispatch(accepted);
  }

  private dispatch(frame: Frame): void {
    const payload = (frame.payload ?? {}) as { sessionId?: string };
    const sessionId = payload.sessionId ?? this.current?.sessionId ?? '';

    if (frame.type === 'session.start') {
      const info = frame.payload as SessionInfo;
      this.sessions.set(info.sessionId, info);
      if (info.sessionId === this.current?.sessionId) this.current = info;
    } else if (frame.type === 'run.result') {
      const result = frame.payload as ServerPayload<'run.result'>;
      const pending = result.requestId ? this.runs.get(result.requestId) : undefined;
      if (pending) {
        this.runs.delete(pending.run.id);
        pending.run.finish(result);
      }
    } else if (frame.type === 'error') {
      this.failRunOn(sessionId, frame.payload as ServerPayload<'error'>);
    } else if (frame.type === 'session.run_state') {
      this.settleLostRuns(frame.payload as ServerPayload<'session.run_state'>);
    } else if (RUN_EVENT_TYPES.has(frame.type)) {
      this.pendingRun(sessionId)?.push(frame as RunEvent);
      if (frame.type === 'tool.confirm_needed')
        this.autoConfirm(frame.payload as ConfirmRequest, sessionId);
    }

    for (const waiter of this.waiters) {
      if (waiter.match(frame)) {
        waiter.resolve(frame);
        break;
      }
    }
    for (const listener of this.listeners.get(frame.type) ?? []) {
      try {
        listener(frame.payload);
      } catch {
        // One listener's failure must not starve the others.
      }
    }
  }

  /** The session's oldest unsettled run: the server runs one prompt per session at a time. */
  private pendingRun(sessionId: string): Run | undefined {
    for (const { run } of this.runs.values()) if (run.sessionId === sessionId) return run;
    return undefined;
  }

  private failRuns(which: (pending: PendingRun) => boolean, error: WrongStackError): void {
    for (const [id, pending] of this.runs) {
      if (!which(pending)) continue;
      this.runs.delete(id);
      pending.run.fail(error);
    }
  }

  /**
   * A turn the server refused or that threw is reported as an `error` frame
   * without a request id; it belongs to the session's pending run.
   */
  private failRunOn(sessionId: string, payload: ServerPayload<'error'>): void {
    if (payload.phase !== 'user_message' && payload.phase !== 'agent.run') return;
    const run = this.pendingRun(sessionId);
    if (!run) return;
    this.runs.delete(run.id);
    run.fail(
      new WrongStackError({
        kind: 'server',
        code: payload.code ?? payload.phase,
        detail: payload.message,
        retryable:
          payload.code === 'session_not_ready' || /already processing/i.test(payload.message),
      }),
    );
  }

  /**
   * After a reconnect the server says per session whether a run is live. It
   * answers after the catch-up, so a run sent on an earlier socket that is
   * still unsettled while the session is idle ended while the connection was
   * down, and its result is no longer in the server's log.
   */
  private settleLostRuns(state: ServerPayload<'session.run_state'>): void {
    if (state.isRunning || !state.sessionId) return;
    this.failRuns(
      (pending) => pending.run.sessionId === state.sessionId && pending.socket < this.socketNumber,
      new WrongStackError({
        kind: 'connection',
        code: 'result_lost',
        detail:
          'The run ended while the connection was down, and the server no longer holds its result.',
      }),
    );
  }

  private autoConfirm(request: ConfirmRequest, sessionId: string): void {
    const handler = this.options.onConfirm;
    // The server re-sends open confirmations to a new socket; one already
    // answered here is not asked again.
    if (!handler || this.answeredConfirms.has(request.id)) return;
    void Promise.resolve()
      .then(() => handler({ ...request, sessionId }))
      .then((decision) => {
        if (decision && !this.unusable()) this.confirm(request.id, decision, sessionId);
      })
      .catch(() => {
        // A throwing handler leaves the request open; the server's deadline applies.
      });
  }

  private handleClose(event: CloseInfo): void {
    const error =
      event.code === NORMAL_CLOSURE
        ? undefined
        : new WrongStackError({
            kind: 'connection',
            code: String(event.code ?? 'closed'),
            ...(event.reason ? { detail: event.reason } : {}),
            retryable: true,
          });
    if (this.closing || !error || this.options.reconnect === false) {
      this.finish(error);
      return;
    }
    this.setState('reconnecting', error);
    void this.reconnect(error);
  }

  private async reconnect(cause: WrongStackError): Promise<void> {
    const policy = this.options.reconnect || {};
    const attempts = policy.attempts ?? 10;
    let delay = policy.initialDelayMs ?? 500;
    let last = cause;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (!(await this.wait(delay))) return;
      delay = Math.min(delay * 2, policy.maxDelayMs ?? 10_000);
      try {
        const { start, early } = await this.open();
        if (this.closing) {
          this.socket.close(NORMAL_CLOSURE, 'client closed');
          return;
        }
        this.receive({ type: 'session.start', payload: start });
        this.connection = 'open';
        this.subscribe(this.current.sessionId, true);
        for (const frame of early) this.receive(frame);
        this.setState('open', undefined);
        return;
      } catch (error) {
        last =
          error instanceof WrongStackError
            ? error
            : new WrongStackError({ kind: 'connection', code: 'reconnect', detail: String(error) });
        // A refused token will be refused again.
        if (last.kind === 'auth') break;
      }
    }
    if (!this.closing) this.finish(last);
  }

  /** Resolves `false` when `close()` cut the wait short. */
  private wait(ms: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.retryTimer = undefined;
        resolve(true);
      }, ms);
      this.retryTimer = {
        cancel: () => {
          clearTimeout(timer);
          this.retryTimer = undefined;
          resolve(false);
        },
      };
    });
  }

  private finish(error: WrongStackError | undefined): void {
    if (this.connection === 'closed') return;
    this.closeError = error;
    this.connection = 'closed';
    this.failRuns(() => true, error ?? new WrongStackError({ kind: 'connection', code: 'closed' }));
    this.setState('closed', error);
    for (const listener of this.closeListeners) {
      try {
        listener(error);
      } catch {
        // Ignored: the connection is gone either way.
      }
    }
  }

  private setState(state: ConnectionState, error: WrongStackError | undefined): void {
    this.connection = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state, error);
      } catch {
        // A listener's failure must not stop the connection's own bookkeeping.
      }
    }
  }
}

import type {
  CoreServerMessage,
  WSSessionStart,
  WSSessionsList,
  WSToolConfirmNeeded,
  WSUserMessageImage,
} from '@wrongstack/webui-protocol';
import type { WebSocketConstructor } from './connection.js';
import type { ConfirmDecision } from './run.js';

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

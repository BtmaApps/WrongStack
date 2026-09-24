/**
 * @wrongstack/client — a typed client for a running WrongStack WebUI server.
 *
 * The frame and body types come from `@wrongstack/webui-protocol`, the same
 * definitions the server and the WebUI build against; the JSON Schema and
 * OpenAPI files published there are generated from them.
 */

export type {
  ApiSession,
  ApiSessionAgents,
  ApiSessionEvents,
  ApiSessionMessageRequest,
  ApiSessionMessageResponse,
  CoreClientMessage,
  CoreServerMessage,
  WrongStackErrorKind,
  WrongStackErrorModel,
} from '@wrongstack/webui-protocol';
export {
  type ConfirmRequest,
  type ConnectionState,
  type ConnectOptions,
  type CoreServerType,
  type ReconnectOptions,
  type SendOptions,
  type ServerPayload,
  type SessionInfo,
  type SessionSummary,
  type WebSocketConstructor,
  type WebSocketLike,
  WrongStackClient,
} from './client.js';
export { WrongStackError } from './errors.js';
export { createHttpClient, type HttpClientOptions, type WrongStackHttpClient } from './http.js';
export { type ConfirmDecision, Run, type RunEvent, type RunResult } from './run.js';

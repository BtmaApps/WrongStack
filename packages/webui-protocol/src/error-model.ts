/**
 * The error a client of the public API sees, whatever failed: the socket, the
 * server, the model provider, or the run. `kind` is the stable part to branch
 * on; `code` narrows it (an HTTP status, a server error phase, a run status);
 * `detail` is for people.
 */
export type WrongStackErrorKind =
  /** The token was refused. */
  | 'auth'
  /** The connection failed or closed. */
  | 'connection'
  /** A frame or response was not what the protocol says. */
  | 'protocol'
  /** The request was malformed (HTTP 400). */
  | 'invalid'
  /** The session or resource does not exist (HTTP 404). */
  | 'not_found'
  /** The server reported a failure (`error` frame, HTTP 5xx). */
  | 'server'
  /** The model provider failed (`provider.error`). */
  | 'provider'
  /** The run ended without finishing (`run.result` failed or max_iterations). */
  | 'run'
  /** The run was aborted. */
  | 'aborted'
  /** No answer in time. */
  | 'timeout';

export interface WrongStackErrorModel {
  kind: WrongStackErrorKind;
  code: string;
  detail?: string | undefined;
  /** Whether trying again may succeed. */
  retryable?: boolean | undefined;
}

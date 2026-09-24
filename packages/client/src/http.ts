import type {
  ApiErrorBody,
  ApiSession,
  ApiSessionAgents,
  ApiSessionEvents,
  ApiSessionInterruptRequest,
  ApiSessionInterruptResponse,
  ApiSessionMessageRequest,
  ApiSessionMessageResponse,
} from '@wrongstack/webui-protocol';
import { kindForStatus, WrongStackError } from './errors.js';

export interface HttpClientOptions {
  /** The WebUI server, `http://127.0.0.1:3456`. */
  url: string;
  /** The access token, sent as `X-WS-Token`. */
  token?: string | undefined;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch | undefined;
}

/**
 * The HTTP session API: every live WrongStack session on the machine (not
 * only the ones this server runs), read from the cross-process registry.
 */
export interface WrongStackHttpClient {
  listLiveSessions(): Promise<ApiSession[]>;
  sessionAgents(sessionId: string): Promise<ApiSessionAgents>;
  sessionEvents(sessionId: string, limit?: number): Promise<ApiSessionEvents>;
  /** Delivered to the session's agent before its next model call. */
  messageSession(
    sessionId: string,
    message: ApiSessionMessageRequest,
  ): Promise<ApiSessionMessageResponse>;
  interruptSession(
    sessionId: string,
    request?: ApiSessionInterruptRequest,
  ): Promise<ApiSessionInterruptResponse>;
}

export function createHttpClient(options: HttpClientOptions): WrongStackHttpClient {
  const doFetch = options.fetch ?? fetch;
  const base = options.url.replace(/^ws(s?):/, 'http$1:');

  async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.token) headers['X-WS-Token'] = options.token;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await doFetch(new URL(path, base), {
        method: init.method ?? 'GET',
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch (error) {
      throw new WrongStackError({
        kind: 'connection',
        code: 'unreachable',
        detail: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    }
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        detail = (JSON.parse(text) as ApiErrorBody).error ?? text;
      } catch {
        // Some refusals are plain text.
      }
      throw new WrongStackError({
        kind: kindForStatus(response.status),
        code: String(response.status),
        ...(detail ? { detail } : {}),
        retryable: response.status >= 500,
      });
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new WrongStackError({
        kind: 'protocol',
        code: 'invalid_json',
        detail: text.slice(0, 200),
      });
    }
  }

  const session = (id: string): string => `/api/sessions/${encodeURIComponent(id)}`;

  return {
    listLiveSessions: () => call<ApiSession[]>('/api/sessions'),
    sessionAgents: (id) => call<ApiSessionAgents>(`${session(id)}/agents`),
    sessionEvents: (id, limit) =>
      call<ApiSessionEvents>(
        `${session(id)}/events${limit !== undefined ? `?limit=${limit}` : ''}`,
      ),
    messageSession: (id, message) =>
      call<ApiSessionMessageResponse>(`${session(id)}/message`, { method: 'POST', body: message }),
    interruptSession: (id, request = {}) =>
      call<ApiSessionInterruptResponse>(`${session(id)}/interrupt`, {
        method: 'POST',
        body: request,
      }),
  };
}

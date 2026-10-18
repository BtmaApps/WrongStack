import {
  decodeProtocolFrame,
  decodeProtocolMessage,
  type ProtocolEnvelope,
} from '@wrongstack/webui-protocol';

export type Connection = 'connecting' | 'open' | 'closed';
export const TOKEN_KEY = 'wrongstack.vibeui.token.v1';
/**
 * A socket must stay open this long before the backoff resets. Resetting on
 * `open` alone let a server that accepts and immediately drops the socket
 * (e.g. a rejected session) drive a reconnect every 750 ms forever.
 */
export const STABLE_CONNECTION_MS = 10_000;

export function socketUrl(
  location: Pick<Location, 'protocol' | 'host' | 'search'>,
  configured?: string | null,
): URL {
  const fallback = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  let url = new URL(fallback);
  if (configured) {
    try {
      const candidate = new URL(configured);
      if (candidate.protocol === 'ws:' || candidate.protocol === 'wss:') url = candidate;
    } catch {
      /* Use the same-origin endpoint for invalid configuration. */
    }
  }
  const token = new URLSearchParams(location.search).get('token');
  if (token && !url.searchParams.has('token')) url.searchParams.set('token', token);
  return url;
}

/** No disconnected write queue: a user action either reaches an open socket or stays in the UI. */
export class VibeTransport {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private stable: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private generation = 0;
  private attempts = 0;
  private lastMessageAt = 0;

  constructor(
    private readonly options: {
      onState: (state: Connection) => void;
      onMessage: (frame: ProtocolEnvelope) => void;
    },
  ) {}

  async connect(): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    clearTimeout(this.retry);
    this.options.onState('connecting');
    try {
      const configured = document
        .querySelector('meta[name="wrongstack-ws-url"]')
        ?.getAttribute('content');
      const url = socketUrl(window.location, configured);
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(TOKEN_KEY);
      } catch {
        /* Optional persistence. */
      }
      // A stored credential belongs only to this exact page origin.
      const sameEndpoint = url.host === window.location.host;
      if (sameEndpoint && !url.searchParams.has('token') && stored)
        url.searchParams.set('token', stored);
      const token = url.searchParams.get('token');
      if (token && sameEndpoint) {
        try {
          const response = await fetch(`/ws-auth?token=${encodeURIComponent(token)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
          });
          if (response.status === 401 && token === stored) {
            // `/ws-auth` answers 401 only for a token the server does not accept.
            // A rejected stored credential would otherwise be resent on every
            // reconnect; drop it so the next attempt can use the cookie or a
            // fresh access link. A token from the page URL is left alone.
            try {
              localStorage.removeItem(TOKEN_KEY);
            } catch {
              /* Optional persistence. */
            }
            url.searchParams.delete('token');
          }
          if (response.ok) {
            url.searchParams.delete('token');
            try {
              localStorage.setItem(TOKEN_KEY, token);
              const page = new URL(window.location.href);
              page.searchParams.delete('token');
              window.history.replaceState(window.history.state, '', page);
            } catch {
              /* Retain the access URL when storage is unavailable. */
            }
          }
        } catch {
          /* Query-token authentication remains available. */
        }
      }
      if (this.stopped || generation !== this.generation) return;
      const socket = new WebSocket(url);
      const previous = this.socket;
      this.socket = socket;
      previous?.close();
      socket.onopen = () => {
        if (this.socket !== socket || this.stopped) return;
        clearTimeout(this.stable);
        this.stable = setTimeout(() => {
          if (this.socket === socket && !this.stopped) this.attempts = 0;
        }, STABLE_CONNECTION_MS);
        this.lastMessageAt = Date.now();
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastMessageAt > 60_000) socket.close();
          else this.send('ping');
        }, 20_000);
        this.options.onState('open');
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket || this.stopped) return;
        this.lastMessageAt = Date.now();
        const frame = decodeProtocolFrame(String(event.data), 'server');
        if (frame.ok) this.options.onMessage(frame.message);
      };
      socket.onclose = () => {
        if (this.socket !== socket || this.stopped) return;
        this.socket = null;
        clearInterval(this.heartbeat);
        clearTimeout(this.stable);
        this.scheduleReconnect();
      };
      socket.onerror = () => socket.close();
    } catch {
      if (!this.stopped && generation === this.generation) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.options.onState('closed');
    clearTimeout(this.retry);
    const delay = Math.min(15_000, 750 * 2 ** Math.min(this.attempts++, 5));
    this.retry = setTimeout(() => void this.connect(), delay * (0.9 + Math.random() * 0.2));
  }

  send(type: string, payload: Record<string, unknown> = {}): boolean {
    if (this.stopped || this.socket?.readyState !== WebSocket.OPEN) return false;
    const decoded = decodeProtocolMessage({ type, payload }, 'client');
    if (!decoded.ok) return false;
    this.socket.send(JSON.stringify(decoded.message));
    return true;
  }

  close(): void {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    clearTimeout(this.stable);
    this.socket?.close();
    this.socket = null;
  }
}

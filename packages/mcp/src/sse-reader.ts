import { ToolError } from '@wrongstack/core/types';

/**
 * SSE-based MCP transport using native fetch.
 *
 * Communication pattern:
 * - Client connects to SSE endpoint to receive server messages (JSON-RPC events)
 * - Client sends JSON-RPC requests via HTTP POST to the same or separate endpoint
 * - Server sends results/errors via the SSE stream
 *
 * The SSE reader parses the SSE protocol (event:, data:, blank line to dispatch).
 */
/**
 * Cap on the pending-line buffer. The upstream SSE parser
 * (packages/providers/src/sse.ts) already enforces 256 KB; this
 * reader is used only inside MCP HTTP transports, but defense-in-depth
 * says we should never let a malicious stream pin memory.
 */
const SSE_READER_MAX_BUFFER = 256 * 1024;
/** Max data lines buffered per event before flush. Prevents a malicious
 *  server from accumulating unbounded data: lines without a blank-line
 *  delimiter would grow this array indefinitely. */
const SSE_READER_MAX_DATA_LINES = 1024;

export class SSEReader {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName = '';
  private endpointListeners: Array<(endpoint: string) => void> = [];

  /**
   * Legacy HTTP+SSE transport: the server's first event is
   * `event: endpoint` whose data is the (relative) URL to POST requests to.
   * Its payload is a URL, not JSON, so it is dispatched separately.
   */
  onEndpoint(cb: (endpoint: string) => void): () => void {
    this.endpointListeners.push(cb);
    return () => {
      const idx = this.endpointListeners.indexOf(cb);
      if (idx >= 0) this.endpointListeners.splice(idx, 1);
    };
  }
  private listeners: Array<
    (event: {
      jsonrpc?: string | undefined;
      method?: string | undefined;
      params?: unknown | undefined;
      id?: number | undefined;
    }) => void
  > = [];

  onMessage(
    cb: (data: {
      jsonrpc?: string | undefined;
      method?: string | undefined;
      params?: unknown | undefined;
      id?: number | undefined;
    }) => void,
  ): () => void {
    this.listeners.push(cb);
    return () => {
      const idx = this.listeners.indexOf(cb);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  feed(chunk: string): void {
    // Guard against a single chunk that exceeds the buffer cap.
    if (chunk.length > SSE_READER_MAX_BUFFER) {
      throw new ToolError({
        message: `SSE: chunk size ${chunk.length} exceeds max buffer ${SSE_READER_MAX_BUFFER} — refusing to accumulate`,
        code: 'TOOL_EXECUTION_FAILED',
        toolName: 'mcp_transport_sse_reader',
        context: { phase: 'feed', chunkLength: chunk.length, maxBuffer: SSE_READER_MAX_BUFFER },
      });
    }
    this.buffer += chunk;
    if (this.buffer.length > SSE_READER_MAX_BUFFER) {
      throw new ToolError({
        message: `SSE: pending line exceeds ${SSE_READER_MAX_BUFFER} bytes — upstream is not framing events`,
        code: 'TOOL_EXECUTION_FAILED',
        toolName: 'mcp_transport_sse_reader',
        context: {
          phase: 'feed',
          bufferLength: this.buffer.length,
          maxBuffer: SSE_READER_MAX_BUFFER,
        },
      });
    }
    // Scan with a moving cursor and slice the retained tail ONCE at the end,
    // instead of `buffer = buffer.slice(idx+1)` per line (which re-copies the
    // whole remaining buffer for every newline — O(n²) for many small lines).
    let start = 0;
    let idx = this.buffer.indexOf('\n', start);
    while (idx !== -1) {
      let end = idx;
      if (end > start && this.buffer.charCodeAt(end - 1) === 13 /* \r */) end--;
      this.processLine(this.buffer.slice(start, end));
      start = idx + 1;
      idx = this.buffer.indexOf('\n', start);
    }
    if (start > 0) this.buffer = this.buffer.slice(start);
  }

  private processLine(line: string): void {
    if (line === '') {
      this.flush();
      return;
    }
    if (line.startsWith(':')) return;

    const colonIdx = line.indexOf(':');
    const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
    let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') {
      this.eventName = value;
    } else if (field === 'data') {
      if (this.dataLines.length >= SSE_READER_MAX_DATA_LINES) {
        throw new ToolError({
          message: `SSE: exceeded ${SSE_READER_MAX_DATA_LINES} data lines per event — upstream is not sending blank-line delimiters`,
          code: 'TOOL_EXECUTION_FAILED',
          toolName: 'mcp_transport_sse_reader',
          context: {
            phase: 'processLine',
            dataLineCount: this.dataLines.length,
            maxDataLines: SSE_READER_MAX_DATA_LINES,
          },
        });
      }
      this.dataLines.push(value);
    }
  }

  private flush(): void {
    const eventName = this.eventName;
    this.eventName = '';
    if (this.dataLines.length === 0) {
      return;
    }
    const data = this.dataLines.join('\n').trim();
    this.dataLines = [];
    if (!data) return;
    if (eventName === 'endpoint') {
      for (const cb of this.endpointListeners) {
        try {
          cb(data);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    try {
      const parsed = JSON.parse(data) as {
        jsonrpc?: string | undefined;
        method?: string | undefined;
        params?: unknown | undefined;
        id?: number | undefined;
      };
      this.dispatch(parsed);
    } catch {
      // ignore parse errors
    }
  }

  private dispatch(msg: {
    jsonrpc?: string | undefined;
    method?: string | undefined;
    params?: unknown | undefined;
    id?: number | undefined;
  }): void {
    for (const cb of this.listeners) {
      try {
        cb(msg);
      } catch {
        /* ignore */
      }
    }
  }

  reset(): void {
    this.buffer = '';
    this.dataLines = [];
    this.eventName = '';
    this.listeners = [];
    this.endpointListeners = [];
  }
}

import type { EngineEvent } from './engine-state';

export type EngineSend = (type: string, payload?: Record<string, unknown>) => Promise<void>;
export type EngineCommand = (
  type: string,
  payload: Record<string, unknown>,
  replies: readonly string[],
  options?: { timeoutMs?: number },
) => Promise<Record<string, unknown>>;

export class EngineReplyError extends Error {
  constructor(
    message: string,
    readonly details: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'EngineReplyError';
  }
}

/** Tracks acknowledgements without persisting outgoing payloads or credentials. */
export class EngineOperations {
  private pending = new Map<
    string,
    {
      replies: readonly string[];
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private send: EngineSend,
    private timeoutMs = 15000,
  ) {}
  request: EngineCommand = (type, payload, replies, options) => {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            'The engine did not acknowledge this request. Refresh this workspace before retrying.',
          ),
        );
      }, options?.timeoutMs ?? this.timeoutMs);
      this.pending.set(requestId, { replies, resolve, reject, timer });
      void this.send(type, { ...payload, requestId }).catch((error: unknown) => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  };
  receive(event: EngineEvent): void {
    const id = event.payload['requestId'];
    if (typeof id !== 'string') return;
    const pending = this.pending.get(id);
    if (!pending || (!pending.replies.includes(event.type) && event.type !== 'error')) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (
      event.type === 'error' ||
      event.payload['success'] === false ||
      event.payload['ok'] === false ||
      typeof event.payload['error'] === 'string'
    )
      pending.reject(
        new EngineReplyError(
          String(event.payload['error'] ?? event.payload['message'] ?? 'Engine request failed.'),
          { ...event.payload },
        ),
      );
    else pending.resolve(event.payload);
  }
  clear(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('This workspace was detached. Reopen it to check the result.'));
    }
    this.pending.clear();
  }
}

/** Bound even injected callers that do not honor cancellation themselves. */
export async function callWithDeadline<T>(
  call: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', forwardAbort, { once: true });
  if (parent?.aborted) forwardAbort();
  const timer = setTimeout(() => controller.abort(new Error(timeoutMessage)), timeoutMs);
  const { signal } = controller;
  let onAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const completion = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return call(signal);
    });
    return await Promise.race([aborted, completion]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', forwardAbort);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

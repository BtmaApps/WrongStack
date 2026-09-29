/**
 * Which assistant-message field carries the previous turn's chain-of-thought
 * back to a Chat Completions endpoint.
 *
 * There is no shared contract: DeepSeek and Kimi REQUIRE `reasoning_content`
 * in thinking mode (and 400 without it), Cerebras rejects that name as an
 * unsupported property and takes `reasoning` instead, and a strict endpoint
 * may accept neither. The default stays `reasoning_content`; a known host gets
 * its own field up front, and any other endpoint that refuses the field it was
 * sent teaches the adapter the next one down (`reasoning_content` →
 * `reasoning` → omit) at the cost of a single failed request.
 *
 * Module-scoped and session-scoped for the same reasons as `effort-support.ts`:
 * the lesson survives provider rebuilds and is re-probed on the next launch.
 */
export type ReasoningEchoField = 'reasoning_content' | 'reasoning' | 'omit';

const learned = new Map<string, ReasoningEchoField>();

function key(providerId: string, model: string): string {
  return `${providerId} ${model}`;
}

/** Test hook: forget every learned field. */
export function resetReasoningEchoSupport(): void {
  learned.clear();
}

/**
 * The field to send for this pair: a learned refusal wins, then an explicit
 * quirk, then the host default. `undefined` means the converter's default
 * (`reasoning_content`).
 */
export function resolveReasoningEchoField(
  providerId: string,
  model: string,
  quirk: ReasoningEchoField | undefined,
  baseUrl: string,
): ReasoningEchoField | undefined {
  return learned.get(key(providerId, model)) ?? quirk ?? hostReasoningEchoField(baseUrl);
}

/** Cerebras documents `reasoning` as the assistant-message field. */
function hostReasoningEchoField(baseUrl: string): ReasoningEchoField | undefined {
  const host = upstreamHost(baseUrl);
  if (host === undefined) return undefined;
  if (host === 'cerebras.ai' || host.endsWith('.cerebras.ai')) return 'reasoning';
  return undefined;
}

/**
 * The host the request finally reaches. With the WrongProxy/WrongTrace toggle
 * on, the host layer rewrites every base URL to `<proxy>/proxy/<host><path>`
 * (`@wrongstack/core` `rewriteBaseUrl`), so the adapter sees `localhost` — the
 * upstream host is the first path segment after `/proxy/`.
 */
function upstreamHost(baseUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return undefined;
  }
  const proxied = /\/proxy\/([^/]+)/.exec(url.pathname)?.[1];
  const host = proxied ? proxied.replace(/:\d+$/, '') : url.hostname;
  return host.toLowerCase();
}

const REFUSAL_WORDING =
  /unsupported|unrecognized|unknown|not (?:allowed|permitted|supported)|extra[_ ](?:forbidden|inputs?|fields?)|additional propert/i;

/**
 * Which echo field this failure says the endpoint refused, if any.
 *
 * Only a request-shaped 400/422 that names the field AND uses refusal wording
 * counts. DeepSeek's "reasoning_content in the thinking mode must be passed
 * back" names the field too, but demands it — that must never teach the
 * adapter to drop it.
 */
export function refusedReasoningEchoField(
  err: unknown,
): Exclude<ReasoningEchoField, 'omit'> | undefined {
  const e = err as {
    status?: unknown;
    body?: { message?: string; raw?: string };
    message?: string;
  };
  if (typeof e?.status !== 'number' || (e.status !== 400 && e.status !== 422)) return undefined;
  const text = [e.body?.message, e.body?.raw, e.message].filter(Boolean).join('\n');
  if (!REFUSAL_WORDING.test(text)) return undefined;
  if (/reasoning_content/i.test(text)) return 'reasoning_content';
  // `reasoning` as a quoted name or a path segment (`messages.2.assistant.reasoning`),
  // never the prefix of `reasoning_effort` / `reasoning_format`.
  if (/(?:\.|['"`])reasoning(?![\w-])/i.test(text)) return 'reasoning';
  return undefined;
}

/**
 * Record the refusal and return the field to retry with, or `undefined` when
 * the failure is not a refusal of the field that was actually sent.
 */
export function learnReasoningEchoRefusal(
  providerId: string,
  model: string,
  sent: ReasoningEchoField | undefined,
  err: unknown,
): ReasoningEchoField | undefined {
  const refused = refusedReasoningEchoField(err);
  const current = sent ?? 'reasoning_content';
  if (refused === undefined || refused !== current) return undefined;
  const next: ReasoningEchoField = current === 'reasoning_content' ? 'reasoning' : 'omit';
  learned.set(key(providerId, model), next);
  return next;
}

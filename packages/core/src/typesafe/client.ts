/**
 * Minimal HTTP client for the TypeSafe System One evaluation endpoint.
 *
 * `POST https://api.typesafe.ai/v1/systemone` takes a `state` (our JSON) plus a
 * map of typed `questions` and returns one typed `answer` per question id. The
 * questions are declarative — Choice picks one option from a set we define,
 * Noul returns the probability a yes/no condition holds — so the answers are
 * data our own code branches on rather than text to parse.
 *
 * This module is subsystem-agnostic: the skill suggester and the agent
 * dispatcher both talk to the same endpoint with different questions, so the
 * transport lives here rather than inside either one.
 *
 * Why not `@typesafe-ai/sdk`: the whole surface we use is one POST with a JSON
 * body. Taking the dependency would put a package on core's import graph for
 * a feature that is OFF by default, and core's cold start is a measured budget
 * (see the eager-dependency work that pulled `undici` and `turndown` back out
 * of the barrel). ~150 lines of `fetch` costs nothing when the feature is
 * disabled, which is the common case.
 *
 * The response is treated as an untrusted third-party payload: every field is
 * validated before it reaches a caller, and a malformed body degrades to
 * `undefined` answers rather than throwing shapes at the suggester.
 */

import { FetchError } from '../types/errors.js';

/** Default TypeSafe evaluation endpoint. */
export const DEFAULT_TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

/** Default model alias. `jev-latest` tracks TypeSafe's flagship System One model. */
export const DEFAULT_TYPESAFE_MODEL = 'jev-latest';

/** Statuses the API documents as transient and worth retrying. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504, 529]);

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string } | undefined;
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Option id -> rubric text (`null` when the id speaks for itself). */
  criteria: Record<string, string | null>;
}

export type TypeSafeQuestion = NoulQuestion | ChoiceQuestion;

export interface NoulAnswer {
  type: 'noul';
  /** Probability the answer is yes, 0..1. */
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  /** The highest-probability option id. */
  choice: string;
  /** Every option id mapped to its probability; sums to 1. */
  probabilities: Record<string, number>;
  /** Distribution concentration, 0..1 — NOT a correctness estimate. */
  confidence: number;
}

export type TypeSafeAnswer = NoulAnswer | ChoiceAnswer;

export interface SystemOneResult {
  answers: Record<string, TypeSafeAnswer>;
  usage: { inputTokens: number; outputTokens: number };
}

export interface SystemOneRequest {
  state: unknown;
  questions: Record<string, TypeSafeQuestion>;
  model?: string | undefined;
}

export interface TypeSafeClient {
  systemOne(req: SystemOneRequest, signal?: AbortSignal): Promise<SystemOneResult>;
}

export interface TypeSafeClientOptions {
  apiKey: string;
  /** Override for self-hosted / proxied deployments. */
  endpoint?: string | undefined;
  model?: string | undefined;
  /** Per-attempt timeout. Default 4000ms. */
  timeoutMs?: number | undefined;
  /** Total attempts including the first. Default 2. */
  maxAttempts?: number | undefined;
  /** Injectable transport; defaults to global `fetch`. Tests pass a stub. */
  fetchImpl?: typeof fetch | undefined;
}

export function createTypeSafeClient(opts: TypeSafeClientOptions): TypeSafeClient {
  const endpoint = opts.endpoint?.trim() || DEFAULT_TYPESAFE_ENDPOINT;
  const model = opts.model?.trim() || DEFAULT_TYPESAFE_MODEL;
  const timeoutMs = opts.timeoutMs ?? 4_000;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    async systemOne(req, signal) {
      const body = JSON.stringify({
        state: req.state,
        model: req.model?.trim() || model,
        questions: req.questions,
      });
      let lastError: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          // Exponential backoff, as the API reference asks for on 429/529.
          await delay(150 * 2 ** (attempt - 1), signal);
        }
        try {
          return await postOnce(doFetch, endpoint, opts.apiKey, body, timeoutMs, signal);
        } catch (err) {
          lastError = err;
          const status = err instanceof FetchError ? err.status : 0;
          // A 401/422 will fail identically on every retry; only spend a second
          // attempt on the statuses the service itself calls transient. A
          // network error (status 0) is worth one more try.
          if (status !== 0 && !RETRYABLE_STATUSES.has(status)) break;
          if (signal?.aborted) break;
        }
      }
      throw lastError;
    },
  };
}

async function postOnce(
  doFetch: typeof fetch,
  endpoint: string,
  apiKey: string,
  body: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<SystemOneResult> {
  // Compose the caller's cancellation with our own deadline so a hung socket
  // cannot outlive the turn it was meant to inform.
  const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
  let res: Response;
  try {
    res = await doFetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.any(signals),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'wrongstack-skill-suggest',
      },
      body,
    });
  } catch (err) {
    throw new FetchError({
      // The key is in a header, never in `endpoint`, so echoing the URL here
      // cannot leak it.
      message: `Network error calling TypeSafe: ${err instanceof Error ? err.message : String(err)}`,
      status: 0,
      context: { url: endpoint, op: 'typesafe.systemOne' },
      cause: err,
    });
  }
  if (!res.ok) {
    throw new FetchError({
      message: `TypeSafe returned ${res.status} ${res.statusText}`,
      status: res.status,
      context: { url: endpoint, op: 'typesafe.systemOne' },
    });
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    throw new FetchError({
      message: 'TypeSafe returned a non-JSON body',
      status: res.status,
      context: { url: endpoint, op: 'typesafe.systemOne' },
      cause: err,
    });
  }
  return parseSystemOneResult(payload);
}

/**
 * Validate a response body into `SystemOneResult`.
 *
 * Exported for tests. Answers that do not match their documented shape are
 * DROPPED rather than coerced: a caller reading `answers['which']` gets
 * `undefined` and takes its own "no suggestion" path, which is always a safe
 * outcome here. Coercing a malformed answer into a plausible-looking one would
 * put a made-up probability in front of a real decision.
 */
export function parseSystemOneResult(payload: unknown): SystemOneResult {
  const root = isRecord(payload) ? payload : {};
  const rawAnswers = isRecord(root['answers']) ? root['answers'] : {};
  const answers: Record<string, TypeSafeAnswer> = {};
  for (const [id, raw] of Object.entries(rawAnswers)) {
    const answer = parseAnswer(raw);
    if (answer) answers[id] = answer;
  }
  const usage = isRecord(root['usage']) ? root['usage'] : {};
  return {
    answers,
    usage: {
      inputTokens: finiteOr(usage['input_tokens'], 0),
      outputTokens: finiteOr(usage['output_tokens'], 0),
    },
  };
}

function parseAnswer(raw: unknown): TypeSafeAnswer | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw['type'] === 'noul') {
    const noul = raw['noul'];
    if (typeof noul !== 'number' || !Number.isFinite(noul)) return undefined;
    return { type: 'noul', noul: clamp01(noul) };
  }
  if (raw['type'] === 'choice') {
    const choice = raw['choice'];
    if (typeof choice !== 'string' || !choice) return undefined;
    const probabilities: Record<string, number> = {};
    const rawProbabilities = isRecord(raw['probabilities']) ? raw['probabilities'] : {};
    for (const [option, value] of Object.entries(rawProbabilities)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        probabilities[option] = clamp01(value);
      }
    }
    return {
      type: 'choice',
      choice,
      probabilities,
      confidence: clamp01(finiteOr(raw['confidence'], 0)),
    };
  }
  // `score` answers are documented but unused here; dropping them keeps the
  // union closed to what this module actually asks for.
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // `unref` keeps a backoff sleep from holding the process open at exit.
    (timer as unknown as { unref?: () => void }).unref?.();
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

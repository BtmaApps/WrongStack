/**
 * Antigravity project bootstrap — `loadCodeAssist`, then `onboardUser`.
 *
 * Every Antigravity request carries a `project`: a Cloud Code project id bound
 * to the Google account. It is not something a user types and not something we
 * can invent — it has to be asked for, and on an account that has never used
 * Antigravity it has to be *created* first.
 *
 * Two calls, in order:
 *
 *   1. `loadCodeAssist` returns the account's project when it has one.
 *   2. `onboardUser` provisions one when it does not. This is a Google
 *      long-running operation, so a first answer of `{"done": false}` means
 *      "ask again", not "no project".
 *
 * The distinction that matters is between an answer of "not yet" and an answer
 * of "never": an `onboardUser` response that settles with no project means the
 * account must supply its own GCP project (Google's BYOP path), which no amount
 * of retrying changes. Reporting that as a transient failure would leave a user
 * re-running a sign-in that cannot succeed, so the two outcomes are
 * distinguished in the return type rather than collapsed into a throw.
 *
 * The project id is stable for an account, so this runs once at sign-in and its
 * result is persisted with the credential. It is re-derived at runtime only
 * when a session starts with a credential that predates this field.
 *
 * @module google-antigravity-bootstrap
 */

import {
  ANTIGRAVITY_BOOTSTRAP_HOST,
  ANTIGRAVITY_LOAD_PATH,
  ANTIGRAVITY_ONBOARD_PATH,
  antigravityBootstrapMetadata,
  antigravityHeaders,
} from './google-antigravity-protocol.js';

/** Tier to request when the account reports none. */
const DEFAULT_TIER_ID = 'legacy-tier';

/** `onboardUser` is a long-running operation; bound how long we humour it. */
const ONBOARD_MAX_ATTEMPTS = 5;
const ONBOARD_POLL_MS = 2_000;
const CALL_TIMEOUT_MS = 15_000;

/**
 * Why no project was found.
 *
 * - `byop_required` — Google settled the operation and declined to create one.
 *   The account has to bring its own GCP project. Permanent; do not retry.
 * - `discovery_failed` — the calls errored, timed out, or never settled.
 *   Retrying later can succeed.
 */
export type AntigravityBootstrapFailure = 'byop_required' | 'discovery_failed';

export type AntigravityBootstrapResult =
  | { ok: true; project: string; tierId: string }
  | { ok: false; reason: AntigravityBootstrapFailure };

interface BootstrapOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Test seam — the delay between long-running-operation polls. */
  pollMs?: number;
}

/** `cloudaicompanionProject` is a bare id on some responses, an object on others. */
function readProjectId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'object' && value !== null) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim().length > 0) return id.trim();
  }
  return undefined;
}

/**
 * The tier to ask `onboardUser` for.
 *
 * `loadCodeAssist` reports the account's current tier when it has one, and
 * echoing it back is what keeps a paid account from being onboarded onto the
 * free tier. When it reports none, the legacy tier is the value the official
 * clients send.
 */
function readTierId(body: unknown): string {
  if (typeof body !== 'object' || body === null) return DEFAULT_TIER_ID;
  const record = body as Record<string, unknown>;
  const current = record['currentTier'];
  if (typeof current === 'object' && current !== null) {
    const id = (current as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim().length > 0) return id.trim();
  }
  const allowed = record['allowedTiers'];
  if (Array.isArray(allowed)) {
    for (const tier of allowed) {
      if (typeof tier !== 'object' || tier === null) continue;
      const entry = tier as { id?: unknown; isDefault?: unknown };
      if (entry.isDefault === true && typeof entry.id === 'string' && entry.id.trim().length > 0) {
        return entry.id.trim();
      }
    }
  }
  return DEFAULT_TIER_ID;
}

function timeoutSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function pollDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

async function postJson(
  path: string,
  body: unknown,
  opts: BootstrapOptions,
): Promise<Record<string, unknown> | undefined> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${ANTIGRAVITY_BOOTSTRAP_HOST}${path}`, {
    method: 'POST',
    headers: antigravityHeaders(opts.accessToken),
    body: JSON.stringify(body),
    signal: timeoutSignal(opts.signal),
  });
  if (!res.ok) return undefined;
  const json: unknown = await res.json().catch(() => null);
  return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
}

/**
 * Discover — provisioning if necessary — the account's Cloud Code project.
 *
 * Throws only on abort. Every other failure is a value, because the caller's
 * choice (tell the user to bring a GCP project, or tell them to try again) is
 * different for each and it cannot make that choice from an exception.
 */
export async function bootstrapAntigravityProject(
  opts: BootstrapOptions,
): Promise<AntigravityBootstrapResult> {
  let tierId = DEFAULT_TIER_ID;
  try {
    const loaded = await postJson(
      ANTIGRAVITY_LOAD_PATH,
      {
        metadata: antigravityBootstrapMetadata(),
      },
      opts,
    );
    if (loaded) {
      tierId = readTierId(loaded);
      const project = readProjectId(loaded['cloudaicompanionProject']);
      if (project) return { ok: true, project, tierId };
    }
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    return { ok: false, reason: 'discovery_failed' };
  }

  const pollMs = opts.pollMs ?? ONBOARD_POLL_MS;
  for (let attempt = 1; attempt <= ONBOARD_MAX_ATTEMPTS; attempt += 1) {
    if (opts.signal?.aborted) throw opts.signal.reason;
    let body: Record<string, unknown> | undefined;
    try {
      body = await postJson(
        ANTIGRAVITY_ONBOARD_PATH,
        { tier_id: tierId, metadata: antigravityBootstrapMetadata() },
        opts,
      );
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      return { ok: false, reason: 'discovery_failed' };
    }
    if (!body) return { ok: false, reason: 'discovery_failed' };

    // Only an EXPLICIT `done: false` is an operation still running. A body with
    // no `done` at all is not an unsettled operation — it is Google's immediate
    // "there is no project and I will not make one", and treating it as "poll
    // again" would spend five requests and 8 seconds arriving at the same
    // answer while telling the user it might still work.
    if (body['done'] === false) {
      if (attempt === ONBOARD_MAX_ATTEMPTS) return { ok: false, reason: 'discovery_failed' };
      await pollDelay(pollMs, opts.signal);
      continue;
    }

    const nested = body['response'];
    const project =
      readProjectId(
        typeof nested === 'object' && nested !== null
          ? (nested as Record<string, unknown>)['cloudaicompanionProject']
          : undefined,
      ) ?? readProjectId(body['cloudaicompanionProject']);
    if (project) return { ok: true, project, tierId };
    return { ok: false, reason: 'byop_required' };
  }
  return { ok: false, reason: 'discovery_failed' };
}

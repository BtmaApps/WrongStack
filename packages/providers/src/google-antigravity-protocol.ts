/**
 * Google Antigravity (Cloud Code) wire protocol — endpoints, client identity,
 * and the request envelope.
 *
 * Antigravity is a Gemini subscription served through Google's **internal**
 * Cloud Code surface rather than the public Generative Language API. The
 * difference is not the model or the message format — it is Gemini underneath —
 * but three layers wrapped around it:
 *
 *   1. A different host and a verb-style path:
 *      `POST {base}/v1internal:streamGenerateContent?alt=sse`.
 *   2. An **envelope**: the Gemini request is nested under `request`, beside a
 *      `project` (a Cloud Code project id that must be discovered first), a
 *      `requestId`, the target `model`, and a client `userAgent`/`requestType`.
 *   3. A client identity Google checks. An incomplete one is answered with 403.
 *
 * None of it is documented or stable — this is the surface Google moved
 * Gemini subscriptions onto when it stopped serving Pro/Ultra plans through
 * the open-source Gemini CLI, and it has been reshaped since. Everything
 * specific to it lives in this module so that when it moves there is exactly
 * one file to correct, and so the Gemini wire format itself stays untouched.
 *
 * Protocol facts below were read off the MIT-licensed OmniRoute gateway
 * (`diegosouzapw/OmniRoute`), which maintains this integration against live
 * accounts; the implementation here is our own. Where its source records a
 * hard-won detail — a field that draws a 400, a header whose absence draws a
 * 403 — the reason is repeated at the point it matters, because a future
 * reader cannot re-derive it from Google's docs. There are none.
 *
 * @module google-antigravity-protocol
 */

import { randomUUID } from 'node:crypto';

/**
 * Hosts that serve inference, in the order to try them.
 *
 * `daily-` is Google's rolling channel and answers first when it is up; the
 * stable host is the fallback. Trying both is what makes a bad deploy on one
 * channel a non-event rather than an outage.
 */
export const ANTIGRAVITY_RUNTIME_HOSTS: readonly string[] = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];

/**
 * Host for the one-time project bootstrap.
 *
 * Deliberately only the stable host: onboarding mutates account state, and
 * running it against the rolling channel risks provisioning against a project
 * the stable host does not yet see.
 */
export const ANTIGRAVITY_BOOTSTRAP_HOST = 'https://cloudcode-pa.googleapis.com';

/**
 * Host the transport sends inference to by default.
 *
 * The stable one, not the rolling `daily-` channel that answers first above.
 * A transport has one base URL for the life of a session and no way to fail
 * over mid-stream, so the predictable host is the right default; the quota
 * reporter, whose failure costs nothing, is free to try both. Point `baseUrl`
 * at the rolling host to opt into it.
 */
export const ANTIGRAVITY_DEFAULT_HOST = 'https://cloudcode-pa.googleapis.com';

export const ANTIGRAVITY_STREAM_PATH = '/v1internal:streamGenerateContent?alt=sse';
export const ANTIGRAVITY_LOAD_PATH = '/v1internal:loadCodeAssist';
export const ANTIGRAVITY_ONBOARD_PATH = '/v1internal:onboardUser';
export const ANTIGRAVITY_QUOTA_PATH = '/v1internal:retrieveUserQuota';
export const ANTIGRAVITY_MODELS_PATH = '/v1internal:fetchAvailableModels';

/** Google's OAuth token endpoint — the same one every Google client refreshes at. */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Google's OAuth consent endpoint. */
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Loopback host for the OAuth redirect.
 *
 * `127.0.0.1`, never `localhost`: Google deprecated the hostname form for
 * native-app loopback redirects, and the port is free because a Google
 * **desktop** client accepts an arbitrary loopback port rather than a
 * registered list. That is what lets the listener take an ephemeral port
 * instead of fighting over a fixed one.
 *
 * On a remote or LAN install this is the trap to know: `127.0.0.1` is the
 * *approving browser's* machine, and when the callback cannot reach the
 * listener Google's consent screen never redirects at all — it hangs, with
 * nothing to paste. The fix is to run the sign-in where the browser is, or to
 * forward the port.
 */
export const ANTIGRAVITY_OAUTH_HOST = '127.0.0.1';

/**
 * Scopes Cloud Code requires.
 *
 * `cloud-platform` is what `v1internal` itself checks; `cclog` and
 * `experimentsandconfigs` are what the official client requests and are part
 * of the identity Google expects from it.
 *
 * **Do not add `openid`.** With PKCE it routes Google into the
 * `firstparty/nativeapp` consent flow, which never completes — the consent
 * screen hangs rather than redirecting. The email/profile pair below is what
 * identifies the account.
 */
export const ANTIGRAVITY_OAUTH_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

// ── Client identity ─────────────────────────────────────────────────────────

/**
 * The client fingerprint Google is shown.
 *
 * Pinned to darwin/arm64 regardless of the host OS. This looks wrong and is
 * not: the backend expects the Mac desktop build's token, and reporting the
 * real platform here has been observed to fail. The *bootstrap* metadata below
 * is the opposite — there the true platform is required. Do not "fix" one to
 * match the other; they are checked by different code on Google's side.
 */
const CLIENT_OS = 'darwin';
const CLIENT_ARCH = 'arm64';

/** Version string presented as the IDE build. */
const DEFAULT_IDE_VERSION = '1.2.5';

/** `User-Agent` for inference and quota calls. */
export function antigravityUserAgent(version: string = DEFAULT_IDE_VERSION): string {
  return `antigravity/ide/${version} ${CLIENT_OS}/${CLIENT_ARCH}`;
}

/**
 * Body metadata for `loadCodeAssist` / `onboardUser`.
 *
 * These are protobuf-JSON int32 enums, **not** strings: sending `ideType:
 * "ANTIGRAVITY"` is answered with 403, and so is omitting `platform` or
 * `pluginType`. An incomplete client identity reads to Google's backend as
 * untrusted. This is the one place the real host platform must be reported.
 */
export function antigravityBootstrapMetadata(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): Record<string, number> {
  return {
    ideType: 9,
    platform: platformEnum(platform, arch),
    pluginType: 2,
  };
}

/** Platform enum as Cloud Code numbers them. 0 is "unspecified". */
function platformEnum(platform: NodeJS.Platform, arch: string): number {
  if (platform === 'darwin') return arch === 'arm64' ? 2 : 1;
  if (platform === 'linux') return arch === 'arm64' ? 4 : 3;
  if (platform === 'win32') return 5;
  return 0;
}

/** Headers for any authenticated Cloud Code call. */
export function antigravityHeaders(accessToken: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'user-agent': antigravityUserAgent(),
    authorization: `Bearer ${accessToken}`,
  };
}

// ── Request envelope ────────────────────────────────────────────────────────

/**
 * Top-level fields the envelope rejects with a 400.
 *
 * Google validates the envelope strictly — an unknown top-level name is
 * `Invalid JSON payload received. Unknown name "x"`, and a whole class of
 * fields that other wires put at the body root land exactly there. Our Gemini
 * preset does not emit these today; the guard exists because it emits a
 * *body*, and a future field added for the public Gemini API would otherwise
 * break every Antigravity request with an error that names JSON rather than
 * the field's owner.
 */
const ENVELOPE_REJECTED_FIELDS: readonly string[] = [
  'output_config',
  'output_format',
  'thinking',
  'reasoning',
  'reasoning_effort',
  'enable_thinking',
  'thinking_budget',
];

/** One Antigravity request. Field order mirrors the official clients'. */
export interface AntigravityEnvelope extends Record<string, unknown> {
  project: string;
  requestId: string;
  request: Record<string, unknown>;
  model: string;
  userAgent: string;
  requestType: 'agent';
}

/**
 * Wrap a Gemini request body in the Cloud Code envelope.
 *
 * `sessionId` on the inner request is what Google's backend uses to group a
 * conversation, and `toolConfig.functionCallingConfig.mode = 'VALIDATED'` is
 * what the official client sends whenever it declares tools — without it the
 * backend is free to answer a tool-shaped turn as prose.
 */
export function buildAntigravityEnvelope(opts: {
  project: string;
  model: string;
  sessionId: string;
  geminiBody: Record<string, unknown>;
  requestId?: string;
}): AntigravityEnvelope {
  const request: Record<string, unknown> = { ...opts.geminiBody, sessionId: opts.sessionId };
  for (const field of ENVELOPE_REJECTED_FIELDS) delete request[field];
  const tools = request['tools'];
  if (Array.isArray(tools) && tools.length > 0) {
    request['toolConfig'] = { functionCallingConfig: { mode: 'VALIDATED' } };
  }
  return {
    project: opts.project,
    requestId: opts.requestId ?? randomUUID(),
    request,
    model: opts.model,
    userAgent: 'antigravity',
    requestType: 'agent',
  };
}

// ── Response envelope ───────────────────────────────────────────────────────

/**
 * Unwrap one SSE payload down to the Gemini chunk inside it.
 *
 * Responses are wrapped the same way requests are: the Gemini chunk — its
 * `candidates`, its `usageMetadata` — sits under `response`, with Cloud Code's
 * own fields (notably `remainingCredits`) beside it. Returning the payload
 * unchanged when there is no `response` key is what keeps a top-level
 * `{"error":{...}}` delivered inside a 200 stream working: the Gemini parser
 * already handles that shape, and it is not wrapped.
 */
export function unwrapAntigravityPayload(data: string): string {
  if (!data.includes('"response"')) return data;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return data;
    const inner = (parsed as { response?: unknown }).response;
    if (typeof inner !== 'object' || inner === null) return data;
    return JSON.stringify(inner);
  } catch {
    // A partial or malformed line is the SSE parser's problem, not ours.
    return data;
  }
}

/** Pay-as-you-go credit balances, reported alongside a response chunk. */
export interface AntigravityCredit {
  creditType: string;
  creditAmount: string;
}

/** Read the credit balances Cloud Code attaches to a response chunk, if any. */
export function readAntigravityCredits(data: string): AntigravityCredit[] | undefined {
  if (!data.includes('remainingCredits')) return undefined;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const raw = (parsed as { remainingCredits?: unknown }).remainingCredits;
    if (!Array.isArray(raw)) return undefined;
    const out: AntigravityCredit[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { creditType, creditAmount } = entry as Record<string, unknown>;
      if (typeof creditType === 'string') {
        out.push({ creditType, creditAmount: String(creditAmount ?? '') });
      }
    }
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

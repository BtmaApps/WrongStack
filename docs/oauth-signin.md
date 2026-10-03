# Sign in with a subscription (OAuth)

WrongStack ships nine interactive provider-auth strategies. Account access,
subscription eligibility, and billing depend on the grant returned by the provider.
OpenRouter mints an API key; Meta exchanges identity for a renewable Model API key.

| Sign-in | Subscription | Wire family (provider id) | Endpoint |
|---|---|---|---|
| **Sign in with ChatGPT** | ChatGPT Plus / Pro / Team (Codex) | `openai-codex` | `chatgpt.com/backend-api` (Responses API) |
| **Sign in with Claude** | Claude Pro / Max | `anthropic-oauth` | `api.anthropic.com` (Messages API) |
| **Sign in with GitHub Copilot** | GitHub Copilot | `github-copilot` | Copilot proxy (OpenAI Chat Completions) |
| **Sign in with OpenRouter** | OpenRouter account | `openrouter` | `openrouter.ai/api/v1` (OpenAI-compatible) |
| **Continue with ChatGPT** | Authorized ChatGPT plan usage | `openai` (`openai-chatgpt`) | `api.openai.com/v1/responses` |
| **Sign in with xAI/Grok** | Eligible Grok/X account | `openai-compatible` (`xai`, Responses transport) | `api.x.ai/v1/responses` |
| **Sign in with Kimi Code** | Kimi Code account | `anthropic` (`kimi-for-coding`) | `api.kimi.com/coding/v1/messages` |
| **Sign in with Meta** | Meta Model API account | `openai-compatible` (`meta`, Responses transport) | `api.meta.ai/v1/responses` |
| **Sign in with Antigravity** | Google account with configured OAuth client | `google-antigravity` | Cloud Code bootstrap and inference |

This is an **orthogonal credential layer** — it sits *next to* the API-key
provider system, it doesn't replace it. The ~110 API-key providers pulled from
[models.dev](https://models.dev) keep working exactly as before; an OAuth
subscription just adds a new, separately-authenticated provider entry you can
select like any other.

---

> [!WARNING]
> **For legacy Codex, Claude, and Copilot flows, using a subscription outside its official client is a Terms-of-Service gray
> area and can get your account rate-limited, suspended, or banned.** These flows
> present WrongStack to the vendor backend the way each official client does
> (Codex CLI / Claude Code / Copilot Chat), but that does **not** make it
> sanctioned. The API-key path is available for programmatic use. OpenAI also
> documents the separate **ChatGPT plan API** flow below. Use provider-specific
> access and billing rules rather than assuming all OAuth tokens spend a subscription.
> Legacy client compatibility does not establish account eligibility or billing.
> OpenRouter's API-key authorization flow is
> documented by OpenRouter and is not one of these subscription-token flows.

---

## New account flows

```bash
wstack auth login xai --alias personal-grok
wstack auth login kimi --alias personal-kimi
wstack auth login meta --alias personal-meta
wstack auth login chatgpt-api --alias personal-chatgpt
```

These entries also appear in the TUI auth panel and WebUI provider settings.
Existing API keys stay available; choosing a key selects its own auth method.

CLI/TUI and WebUI startup renew expiring tokens for these account flows before
fetching the model catalog, using the same encrypted-config transaction as
inference. Token rotation preserves the account's cached catalog; another account
cannot reuse it. Discovery warnings identify HTTP/auth, renewal, timeout, network,
or response-format failures instead of assuming the server is unreachable.

- **xAI:** device authorization at `auth.x.ai`, then renewable Bearer access
  to the public Responses endpoint. The login uses a public native-client ID;
  provider eligibility must be verified on the account actually used.
- **Kimi:** device authorization at `auth.kimi.com`, refresh-token renewal,
  and the existing Anthropic-compatible Kimi Code endpoint. The official
  `https://api.kimi.ai/coding/v1` endpoint is also accepted for an international
  account; set the provider base URL to it. OAuth tokens are restricted to
  these two official Kimi Code endpoints.
- **Meta:** device authorization at `auth.meta.com`; exchange the identity token
  at `api.meta.ai/muse-code/key`. Renewal re-mints the Model API key rather than
  using an ordinary refresh grant. A rejected identity session requires sign-in.
  Meta documents Muse subscription credentials as intended for Muse Code;
  do not assume a minted key grants subscription billing in WrongStack.
- **ChatGPT plan API:** separate from `wstack auth login chatgpt` (legacy Codex).
  New registrations use `dynamic_agent_client` with `agent_name_hint=WrongStack`
  and a stable per-host ID in `~/.wrongstack/chatgpt-host-id`. The account's issued
  client ID, verified OIDC subject, ID token, scope and rotating tokens are kept
  with its credential in the existing vault. Reauthorization of the same alias
  reuses that registration. ID-token signature, issuer, audience, expiry and
  nonce are verified before replacing credentials. Inference requires the granted
  `chatgpt.tokens.use.direct` scope, uses `store:false` / `stream:true`, and lists
  account-visible models from `GET https://api.openai.com/v1/models`.
  Local tools are grouped in the `wrongstack` namespace. The preview route rejects
  sampling controls and `max_output_tokens`, so these fields are omitted; a
  configured request output cap cannot be enforced by that endpoint.

The four new flows serialize token exchange and persistence under the host's
existing encrypted-config file lock. CLI and standalone WebUI re-read the account
while holding that lock, adopt an already-rotated token, and preserve other keys
and the selected key. Embedded WebUI uses the CLI host. Library consumers without
a persistence host retain process-local renewal.

When WrongProxy is enabled and reachable, these four flows also accept the
host's exact rewritten route to their official API endpoint. Startup, model
switches, and account aliases use this same validation. An arbitrary proxy
address or a changed upstream is rejected; OAuth token renewal stays direct.

Account-authenticated model pickers use the account's live API catalog.
Copilot honors picker visibility, policy and supported inference endpoints;
its server-selected default is retained even when alternate selection is
disabled. Internal or hidden fallback models are excluded. No model ID is
invented when discovery fails. CLI and WebUI keep an account-specific cache
of actual successful responses; another account cannot inherit that cache.
An authoritative empty response clears previous model choices. Generic
models.dev and curated catalogs may enrich known IDs but do not add models
to an OAuth account. Copilot refreshes runtime model/context metadata at most
once per five minutes, with a short retry cooldown after unavailable probes.

References: [OpenAI registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[OpenAI inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
[Meta subscriptions](https://dev.meta.ai/docs/muse-code/subscriptions),
and [Pi's device protocols](https://github.com/earendil-works/pi/tree/4c6fb7cfe8c538a668726f6f8b3554098c39faee/packages/ai/src/auth/oauth).

Protocol fixtures cover login, cancellation, renewal, inference wires, identity
validation and two real processes sharing a rotation. These are not live provider
account or subscription-billing evidence.

## How it works

- **Distinct wire families.** Each subscription is its own `WireFamily`
  (`openai-codex`, `anthropic-oauth`, `github-copilot`) with its own request
  shape, headers, and auth. Nothing about the API-key `openai` / `anthropic`
  families changes.
- **Browser/device login.** Codex, Claude, and OpenRouter use a **PKCE loopback**
  flow (a local callback server receives the code); Copilot uses **GitHub's
  device flow** (you enter a code at `github.com/login/device`). No API key is
  typed.
- **Runtime registry.** CLI, TUI, and WebUI read the same provider-auth registry.
  Plugins with the `providerAuth` capability can add browser or device-code
  strategies without adding provider-specific UI branches.
- **Credential lifecycle.** Subscription access tokens refresh automatically
  near expiry and once on a `401`; OpenRouter instead returns a normal API key,
  so it has no refresh-token lifecycle.
- **Encrypted at rest.** The access/refresh tokens are stored in
  the active profile config under `providers.<id>`, encrypted with your
  per-machine key (`~/.wrongstack/.key`, AES-256-GCM) like every other secret.
- **Legacy client fidelity.** Legacy subscription adapters send the User-Agent / beta / app headers of
  the corresponding official client so the subscription backend accepts the
  request. This is a documented gray area, **not** an undetectable disguise (see
  the warning above).

## Quick start

Interactive menu:

```bash
wstack auth          # → choose the interactive sign-in option
```

Or go straight to one provider:

```bash
wstack auth login chatgpt     # Sign in with ChatGPT  → provider openai-codex
wstack auth login claude      # Sign in with Claude   → provider anthropic-oauth
wstack auth login copilot     # Sign in with Copilot  → provider github-copilot
wstack auth login openrouter  # Sign in with OpenRouter → provider openrouter
```

After login, select the provider/model like any other:

```bash
wstack --provider openai-codex --model <account-model-id> "explain this repo"
wstack --provider anthropic-oauth --model <account-model-id> "find the bug in src/auth.ts"
wstack --provider github-copilot --model <account-model-id> "write tests for utils.ts"
```

…or pick them from the TUI `/model` picker — OAuth providers appear in the list
automatically once a subscription is signed in.

---

## Sign in with ChatGPT (Codex)

```bash
wstack auth login chatgpt
# aliases: openai · codex · codex-cli · openai-codex
```

- **Flow:** PKCE loopback (`localhost:1455/auth/callback`) against
  `auth.openai.com`, mirroring the real Codex CLI's "Sign in with ChatGPT".
- **Provider id:** `openai-codex` · **Endpoint:** `https://chatgpt.com/backend-api/codex`
  (the Responses API, not `chat/completions`).
- **Models:** fetched from the authenticated account's `/codex/models`
  endpoint; no bundled or generic model list is substituted.
- **Use:** choose an account model in `/model`, or pass its returned ID with `--model`.
- **Requires** a ChatGPT **Plus / Pro / Team** plan with Codex access. A plain
  free account will authenticate but be rejected at request time.

### Quota and prompt cache

A ChatGPT-login account is metered on rolling windows (typically 5 hours and a
week), and the backend reports the burn only in **response headers**
(`x-codex-*-used-percent`, `-window-minutes`, `-reset-at`, plus credits and, on
a cut-off, `x-codex-rate-limit-reached-type`). WrongStack reads those on every
request and keeps the latest reading:

```bash
/openai-quota   # windows used, % left, and time to reset
```

The reading is observational — it appears after the first request of a session
and never costs a request of its own. When a `429` does arrive, its
`-reset-at` becomes the exact retry time, so an exhausted plan parks until the
window reopens instead of being re-probed on a backoff schedule.

Four things keep the ChatGPT-side prompt cache hitting, and all four matter
because everything they save is quota that is not spent twice:

- `prompt_cache_key` routes prefix-sharing requests to one cache partition.
- Stable `session-id`, `thread-id`, and `x-client-request-id` values preserve
  conversation affinity without leaking turn-scoped state.
- WebSocket continuations use `previous_response_id` only after proving that
  the new input is an exact extension of the prior request and server output.
- `x-codex-turn-state` is reused only inside that same turn (for example after
  WebSocket prewarm), never on a later user turn.
- Reasoning is replayed. The transport asks for
  `include: ['reasoning.encrypted_content']` and sends the encrypted items back
  on the next turn; because `store: false` leaves no server-side state, a
  reasoning model that cannot see its own prior reasoning re-derives it — and
  bills for it — every turn. If the backend ever rejects a replayed item the
  transport drops the replay and retries, so this can only cost tokens, never a
  turn.

## Sign in with Claude

```bash
wstack auth login claude
# aliases: anthropic · claude-pro · claude-max · anthropic-oauth
```

- **Flow:** PKCE loopback (`localhost:53692/callback`) against
  `claude.ai/oauth/authorize`, the same grant Claude Code uses.
- **Provider id:** `anthropic-oauth` · **Endpoint:** `https://api.anthropic.com`
  (Messages API, Bearer auth + Claude Code beta headers).
- **Models:** fetched live from your account's `/v1/models` at login; falls back
  to `anthropic-test-model`, `claude-opus-4-8`.
- **Use:** `wstack --provider anthropic-oauth --model claude-opus-4-8 "<task>"`
- **Requires** a Claude **Pro / Max** subscription. Modern Claude models
  eligible long-context models serve their full **1M-token** context window on this
  path with no extra flags (see [context windows](#context-windows) below).

## Sign in with GitHub Copilot

```bash
wstack auth login copilot
# aliases: github · github-copilot · gh
```

- **Flow:** GitHub **device flow** — you open `github.com/login/device` and paste
  the shown code. WrongStack then mints a short-lived Copilot token from your
  long-lived GitHub token.
- **Provider id:** `github-copilot` · **Endpoint:** the Copilot proxy resolved
  from the token (OpenAI Chat Completions wire).
- **Models:** fetched live from the Copilot models endpoint; falls back to
  `gpt-4o`.
- **Use:** `wstack --provider github-copilot --model gpt-4o "<task>"`
- **Requires** an active **GitHub Copilot** subscription on the signed-in
  account.

## Sign in with OpenRouter

```bash
wstack auth login openrouter
# aliases: openrouter-login · openrouter-oauth
```

- **Flow:** ephemeral `127.0.0.1` callback with S256 PKCE, following
  [OpenRouter's documented OAuth flow](https://openrouter.ai/docs/guides/overview/auth/oauth).
- **Provider id:** `openrouter` · **Endpoint:** `https://openrouter.ai/api/v1`.
- **Credential:** the authorization code is exchanged for a user-controlled
  OpenRouter API key and stored through the same encrypted key-vault path as
  manually entered keys.
- **Models:** an existing curated allowlist is preserved; model discovery stays
  in the normal OpenRouter/models.dev catalog path.

---

## Sign in with Google Antigravity

```bash
wstack auth login antigravity
# aliases: agy · google-antigravity · gemini-subscription
```

- **Flow:** authorization-code + S256 PKCE on a `localhost:51121` callback,
  then a Cloud Code project bootstrap. A sign-in that cannot resolve a project
  fails instead of storing a credential that could not serve a request.
- **Provider id:** `google-antigravity` · **Endpoint:**
  `https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent`.
- **Needs an OAuth client you supply** — `WRONGSTACK_ANTIGRAVITY_CLIENT_ID`
  and `_CLIENT_SECRET`. Nothing is bundled, because the client Antigravity's own
  app uses is extracted from a proprietary binary rather than published.
- **Quota:** per-model buckets, read after a completed turn. Credits arrive free
  on the response stream.
- **Read [the provider guide](antigravity-provider.md) first.** This one runs on
  an undocumented internal Google surface and is materially more fragile than
  the four above.

---

## Context windows

OAuth providers aren't published in the models.dev catalog under their own id, so
WrongStack resolves each model's real context window from its **sibling catalog**
(`anthropic-oauth` → `anthropic`, `openai-codex` / `github-copilot` → `openai`).
That means you get the true per-model window — e.g. **Claude Opus 4.8 → 1M**,
**gpt-5.5 → ~1.05M** — instead of a flat family default.

No beta header or `[1m]` suffix is needed: modern Claude (4.6+/4.8) serves 1M
natively, and the legacy `context-1m-2025-08-07` beta was retired on
2026-04-30. If you ever need to pin a different window, set
`providers.<id>.capabilities.maxContext` in `config.json`.

## Token storage, refresh & sign-out

- Tokens live under `providers.<id>` in the active profile config, encrypted.
  The entry records `authMethod: "oauth"`, the access token (as `apiKey`), the
  `refreshToken`, and `expiresAt`.
- Subscription-token refresh is automatic — near expiry before a request, and
  once on a `401`. The rotated tokens are persisted in place; you won't be asked
  to log in again until the refresh token itself is revoked or expires.
- OpenRouter OAuth produces an API key, not an access/refresh-token pair. Revoke
  it from OpenRouter or remove the local provider key to sign out.
- To sign out, remove the provider entry (`wstack auth` → manage keys) or delete
  it from `config.json`. Re-run `wstack auth login <provider>` to sign back in.

## Troubleshooting

| Symptom | Meaning |
|---|---|
| `400 … You're out of extra usage` (Claude) | Login + wire are working — your subscription's usage quota is exhausted. Add usage at `claude.ai/settings/usage`. |
| `This account may not have … subscription access` | The signed-in account lacks the required plan (Codex/Copilot) — sign in with an entitled account or use an API key. |
| Provider not in the `/model` picker | The login didn't persist a provider entry. Re-run `wstack auth login <provider>` and watch for a success line. |
| Context shows a smaller window than expected | The model isn't in the sibling catalog; set `providers.<id>.capabilities.maxContext`, or refresh the catalog (drop `--no-models-refresh`). |

## See also

- [`docs/configuration.md`](configuration.md) — full config reference, including
  `providers.<id>` and `capabilities` overrides.
- [`docs/subcommands/`](subcommands/) — the `wstack auth` subcommand family.
- The API-key path remains the sanctioned option for automation — `wstack auth
  <provider>` stores a key the normal way.

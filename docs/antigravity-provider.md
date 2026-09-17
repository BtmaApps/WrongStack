# Google Antigravity (`google-antigravity`)

Use a Google Antigravity (Gemini) subscription as a WrongStack provider, the
same way `openai-codex`, `anthropic-oauth` and `github-copilot` use theirs.

> **Read this before relying on it.** Antigravity is served through Google's
> internal Cloud Code surface. Nothing about it is documented or promised, and
> it is the surface Google moved Gemini subscriptions onto after it stopped
> serving Pro/Ultra plans through the open-source Gemini CLI — it has been
> reshaped since and will be again. Unlike the Claude and Codex integrations,
> which read headers that ride along on requests we already make, this is a
> whole transport against a moving target. Expect to have to fix it.

## What it is

Underneath, Antigravity is Gemini: the same messages, tools, thought
signatures and usage numbers, handled by the same Gemini wire format this
project already had. Three layers are wrapped around it.

**A different endpoint.** `POST {host}/v1internal:streamGenerateContent?alt=sse`
on `cloudcode-pa.googleapis.com`, not the public Generative Language API. It is
streaming-only; the non-streaming sibling is not used by Google's own clients
and is not a fallback.

**An envelope.** The Gemini request is nested under `request`, beside the
account's Cloud Code `project`, a `requestId`, the target `model`, and a client
`userAgent`/`requestType`. Responses are wrapped the same way — the Gemini
chunk sits under `response`, with Cloud Code's own fields (notably
`remainingCredits`) beside it. The envelope validates strictly: an unknown
top-level field is rejected as `Invalid JSON payload received. Unknown name
"x"`, which is why `output_config`, `thinking` and their relatives are stripped
before a request goes out.

**A project.** Every request carries a Cloud Code project id. It is discovered
at sign-in via `loadCodeAssist`, provisioned via `onboardUser` for an account
that has never used Antigravity, and then stored on the credential so later
sessions start immediately.

All three live in `packages/providers/src/google-antigravity-protocol.ts`, so
when Google moves something there is one file to correct.

## Setting it up

### 1. Supply a Google OAuth client

This is the one step that is not automatic, and it is deliberate.

Google validates which OAuth client minted an access token. The client
Antigravity's own app uses is not published — obtaining it means extracting a
client id and secret from a proprietary binary. Shipping someone else's
extracted secret inside this repository is not a decision to make on a user's
behalf, so there is no bundled default. Sign-in reads the client from the
environment:

```bash
export WRONGSTACK_ANTIGRAVITY_CLIENT_ID="...apps.googleusercontent.com"
export WRONGSTACK_ANTIGRAVITY_CLIENT_SECRET="..."
```

Without them the sign-in refuses to start and says so, rather than opening a
browser at a consent screen Google will reject.

What you can legitimately put there:

- **The published Gemini CLI client.** Gemini CLI is open source and its client
  is in its repository. Whether Google grants *Antigravity* entitlement to that
  client is untested here — Google serves the two as separate clients, so treat
  it as worth trying, not as expected to work.
- **Your own Google Cloud OAuth client**, created as a **Desktop app** — that
  type accepts any loopback port, which is what lets the sign-in take an
  ephemeral one. Same caveat: the `v1internal` surface may only answer clients
  it recognizes.
- **The Antigravity client's own credentials**, if you extract them yourself.
  That is your call to make, not ours to distribute.

### 2. Sign in

```bash
wstack auth login antigravity     # aliases: agy, google-antigravity
```

The flow is authorization-code + PKCE on an ephemeral `127.0.0.1` loopback
listener (`localhost` is deprecated for native-app redirects; a Google desktop
client accepts any loopback port), then the project bootstrap. A sign-in that cannot resolve a project
**fails** rather than storing a credential — one with no project cannot serve a
single request, and a provider that looks connected and dies on first use is
worse than a clear failure.

### 3. Refresh

Refresh uses the same client, resolved **config first, environment second** — so
the environment above is already enough to keep a session working. Put it in
the provider config to make it survive beyond the shell that ran the sign-in:

```json
{
  "providers": {
    "google-antigravity": {
      "type": "google-antigravity",
      "family": "google-antigravity",
      "oauthClientId": "...apps.googleusercontent.com",
      "oauthClientSecret": "..."
    }
  }
}
```

With neither source set the provider still runs on a live access token and
fails with an actionable message — not an opaque Google 401 — once a refresh is
due.

## Quota

Antigravity meters **per model**: each Gemini variant has its own bucket with
its own reset, reported by `retrieveUserQuota` as a `remainingFraction` (0..1
of what is *left* — the inverse of every other provider here).

A 429 carries its reset as prose — `Your quota will reset after 2h7m23s` — with
no `Retry-After` header, so the shared error parser learned that shape; the
waiting room parks the model on it instead of guessing a backoff. An explicit
`reset after 0s` is a burst throttle rather than a plan window and is reported
as "no hint" on purpose, leaving the retry policy's short backoff in charge.

Quota appears in [`/provider-quota`](slash/provider-quota.md) and the
statusline chip like any other metered plan, with two differences worth
knowing:

- **The read is bound to a completed turn**, not a timer. This host is the
  metered one, so a background poll would spend the plan in order to describe
  the plan.
- **A bucket that reports no fraction is omitted.** "Not reported" is not "0%
  left", and rendering it as either would be a lie. A bucket with a full
  allowance and no reset is omitted too — it is not on a rolling window at all.

Pay-as-you-go credits (`remainingCredits`) are read straight off the response
stream, so they cost nothing.

## Troubleshooting

**`403` on sign-in or bootstrap.** The client identity Google is shown is
incomplete or not one it trusts. The bootstrap metadata sends protobuf-JSON
*integer* enums (`ideType`, `platform`, `pluginType`) and omitting any of them —
or sending `ideType` as a string — is answered with 403.

**`400 Unknown name "..."`.** A field reached the envelope that Google does not
accept at the top level. Add it to `ENVELOPE_REJECTED_FIELDS` in the protocol
module.

**"this Google account has no Cloud Code project".** Google settled the
onboarding operation and declined to create one; the account has to bring its
own GCP project. This is permanent — retrying the sign-in cannot fix it.

**Empty turns.** Most likely the response envelope moved. The unwrap expects
the Gemini chunk under `response` and passes anything else through untouched,
so a renamed wrapper reads as a stream of chunks the Gemini parser ignores.

**The consent screen hangs and never redirects.** Two causes. On a remote or
LAN install, `127.0.0.1` is the *approving browser's* machine rather than the
one running the listener — run the sign-in where the browser is, or forward
the port; there is nothing to paste, because no redirect is ever issued. The
other cause is an `openid` scope: with PKCE it routes Google into the
`firstparty/nativeapp` consent flow, which never completes. The scope list in
the protocol module deliberately omits it.

**A platform note that looks like a bug.** The runtime `User-Agent` pins
`darwin/arm64` regardless of the host OS, while the bootstrap metadata reports
the *real* platform. Both are intentional and are checked by different code on
Google's side. Do not make one match the other.

## Models

Antigravity is not in models.dev, so `fetchAvailableModels` at sign-in is the
whole answer to "what can I select"; the discovered ids are stored on the
provider. Google's own internal models are filtered out — selecting one
answers 403, which reads as a broken login rather than a bad model choice. A
failed discovery does not fail the sign-in: a catalog lookup is not worth
discarding a working credential over, and a model can be named by hand.

## See also

- [OAuth sign-in](oauth-signin.md) — the other subscription logins
- [`/provider-quota`](slash/provider-quota.md) — plan usage across providers
- `packages/providers/src/google-antigravity-protocol.ts` — every endpoint,
  header and enum this integration depends on

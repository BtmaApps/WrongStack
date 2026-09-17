# /provider-quota — Subscription Quota Across Every Metered Provider

No aliases. In particular **not** `/quota` or `/usage`: those read as
"what this project costs" — an account-wide spend view that does not exist here
— and would occupy the name if one is ever built. What this shows is the
provider plane's readings, so that is what it is called.

## What it does

Lists, for every provider that has reported this session, how much of that
subscription's plan has been consumed on each rolling window and when each
window resets.

Four provider families are metered on plans rather than per token, and all of
them report into the same store:

| Provider | Windows | Where the reading comes from |
| --- | --- | --- |
| Claude Pro/Max (`anthropic-oauth`) | `5h`, `7d` | `anthropic-ratelimit-unified-*` response headers |
| ChatGPT / Codex (`openai-codex`) | `primary`, `secondary` (commonly 5h + weekly) | `x-codex-*` response headers |
| GitHub Copilot (`github-copilot`) | one 30-day window per pool (`premium_interactions`, `chat`, `code`) | `GET api.github.com/copilot_internal/user` |
| Google Antigravity (`google-antigravity`) | one per model bucket | `POST cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` |

For ChatGPT/Codex on its own, [`/openai-quota`](openai-quota.md) answers the
same question without making you read past the other providers.

## Output

```
WrongStack — provider subscription quota

  anthropic-oauth — claude plan: max
    5h   █████████████░░░░░░░░░░░ 55% (45% left) · resets in 1h 42m
    7d   ███░░░░░░░░░░░░░░░░░░░░░ 12% (88% left) · resets in 5d 3h
    as of 8s ago

  github-copilot — copilot plan: individual
    30d  ██████████████████████░░ 90% (10% left) · resets in 13d
    30d  ███████░░░░░░░░░░░░░░░░░ 30% (70% left) · resets in 13d
    as of 4m ago

  openai-codex — codex plan: pro
    5h   ████████████░░░░░░░░░░░░ 51% (49% left) · resets in 2h 18m
    7d   ██████░░░░░░░░░░░░░░░░░░ 24% (76% left) · resets in 4d 6h
    as of 12s ago
```

Providers are sorted by id so the output does not reshuffle between runs. Bars
turn amber at 70% and red at 90%.

## Notes

- **The header-based readings cost nothing.** Claude and Codex publish the burn
  on the responses to requests you were already making, so a provider appears
  after its first request of the session and never costs an extra one. Before
  then the command says so.
- **Antigravity reports what is LEFT, not what is used.** Its
  `remainingFraction` is inverted on the way in, and a bucket that reports no
  fraction is omitted rather than shown as full or empty — "not reported" is
  not "0% left". Its read is bound to a completed turn because, unlike the two
  below, the host that answers it is the metered one. See
  [the provider guide](../antigravity-provider.md).
- **Copilot is the exception, and it still costs no entitlement.** Copilot
  publishes nothing on the chat response, so its allowance is read from
  `api.github.com` with the long-lived GitHub OAuth token — a different host
  from the metered inference endpoint. The read is bound to the token mint
  (roughly twice an hour) and is never awaited, so a slow or failed GitHub
  response cannot delay or fail a turn. A failure leaves the previous reading
  standing.
- **Nothing is polled on a metered endpoint.** Spending a metered request to ask
  how much of a metered plan is left is the wrong trade, so the store is never a
  fetcher. Anthropic's `GET /api/oauth/usage` is deliberately not used: it is
  undocumented, needs the `user:profile` scope (a `setup-token` credential gets
  a 403), and rate-limits per access token — the header family gives the same
  numbers for free.
- **API-key providers never appear.** They bill per token and report no plan
  window. Anthropic's per-minute `anthropic-ratelimit-requests-*` /
  `-tokens-*` buckets are throughput allowance, not plan budget: they refill
  every minute, so a burst that takes one to 95% is ordinary traffic. Letting
  them in would paint "your subscription is nearly gone" over a healthy account.
  Throughput backpressure belongs to the retry path, which reads `retry-after`.
- **For provider health** rather than plan budget, see
  [`/provider-status`](provider-status.md).

## Statusline and WebUI

Both surfaces already show this data and needed no change to pick up the new
providers: the `quota` statusline chip and the WebUI chat-header chip render the
most-consumed window across **every** metered provider, and the WebUI server
broadcasts each reading as an unstamped `provider.quota` frame. All of it reads
the shared store in `@wrongstack/core/quota` and never learns which provider it
is looking at. See [`/openai-quota`](openai-quota.md) for the details of the
chip and the WebSocket contract, and
[OAuth sign-in](../oauth-signin.md) for the login flows.

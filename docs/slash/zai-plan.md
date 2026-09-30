# /zai-plan — Z.AI / BigModel GLM Coding Plan

No aliases. The name is scoped to the vendor on purpose: it reports one
vendor's account, not "usage" in general.

## What it does

Shows the GLM Coding Plan the way the official ZCode client's usage panel does,
for every Z.AI (`api.z.ai`) or BigModel (`open.bigmodel.cn`) provider active in
the session:

- **Plan** — the subscription in force (product, billing cycle, renewal or end
  date). The account's order history (renewals, gifted months, a queued annual
  plan) is skipped; only the entry that is `VALID` and in its current period
  counts. Prices and order numbers are never read into the report.
- **5-hour / weekly windows** — the model budget, used share and reset time.
- **MCP tool calls** — the monthly pool shared by web search, web reader and
  zread, with the per-tool split.
- **Usage** — tokens over the last N days per model, with the server-reported
  cache-hit and off-peak rates, the current daily streak and the peak day.
- **Service health** — the platform's decode speed and success rate for the
  pro/max and lite tiers, latest day.

```
WrongStack — GLM Coding Plan

  zai-coding-plan (api.z.ai)
    plan   GLM Coding Max · annually · ends 2026-12-01 (auto-renew off)
    5h   ██░░░░░░░░░░░░░░░░░░░░░░ 8.0% (92% left) · resets in 3h 17m
    MCP    197/4000 tool calls this month (search-prime 165, web-reader 32) · resets in 1d 2h
    last 7d 8.38B tokens · cache hit 94.0% · off-peak 0%
      GLM-5.3-Flash      6.92B  83% · out 18.6M · cached 94%
      GLM-5.3            1.46B  17% · out 10.9M · cached 93%
      streak 7d · peak 2.05B on 2026-09-27
    service 2026-09-30  pro/max 120 tok/s · 99.95% ok  lite 96 tok/s · 99.96% ok
```

## Usage

```
/zai-plan          Plan, quota windows and the last 7 days of usage
/zai-plan <days>   Same, with a 1–30 day usage window (the API's maximum)
```

## Notes

- **It asks, and asking is free.** Unlike `/provider-quota`, which replays what
  turns already observed, every section here is a read on the account's
  monitor API (`/api/monitor/…`, `/api/biz/subscription/list`), authenticated
  with the provider's own API key — sent raw, without `Bearer`, as the API
  expects. None of these is a model call, so looking spends nothing.
- **The windows also live in the quota plane.** After each completed turn on a
  Coding Plan endpoint (at most once a minute) the same quota read feeds the
  status-bar chip, the WebUI header chip and [`/provider-quota`](provider-quota.md).
  Running `/zai-plan` refreshes them too. The MCP pool is kept off the chip: a
  web-search allowance near its cap must not read as the model plan running out.
- **Pay-as-you-go endpoints are flagged.** A provider on `/api/paas/v4` bills
  per token; its calls never draw on the plan, so no plan windows are recorded
  for it and the report says so.
- **Personal plans only.** Team plans are scoped by organization/project
  headers that only ZCode's OAuth login carries; the report reads the personal
  plan the API key belongs to.
- **BigModel account reads** go to the inference host first and fall back to
  `bigmodel.cn`, the business origin ZCode uses.

## Related behavior on Z.AI / BigModel providers

The same transport layer that feeds this report also:

- files Z.AI business codes the HTTP status alone misfiles — `1310`
  ("Weekly/Monthly Limit Exhausted", sent as a 429) is an exhausted plan, not a
  burst rate limit; `1308`/`1304`/`1313` likewise, `1312` is overload;
- sets the wait until the exact window reset from the quota read, falling back
  to the message's "reset at …" stamp read in platform time (UTC+8) — the
  generic parser could only guess the zone;
- names the other deployment when a key is rejected but belongs there
  (Z.AI and BigModel are separate accounts);
- gives BigModel ids and custom aliases the GLM wire contract (GLM-5.3 always
  thinks, depth via `reasoning_effort` low | high | max) that only the `zai*`
  presets had, and maps thinking on Z.AI's Anthropic-compatible
  `/api/anthropic` to GLM's own `thinking` / `output_config.effort` shape.

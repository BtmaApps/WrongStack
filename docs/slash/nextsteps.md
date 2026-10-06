# /nextsteps — Required Next Steps and the Auto-Continue Limit

## What it does

Controls two settings that decide how long `auto` autonomy keeps working:

- **Mode** (`autonomy.nextSteps`) — whether the leader must close every finished
  turn with a `<nextsteps>` block or the `<nextsteps-complete/>` marker.
- **Limit** (`autonomy.autoProceedMaxIterations`) — how many automatic turns may
  run back to back before auto-proceed pauses for input.

Defaults: **required** and **unlimited**. Together with `auto` autonomy, a run
keeps proposing and executing the next piece of work until the model declares
the work complete.

## Usage

```
/nextsteps                     Show the current mode and limit
/nextsteps required [limit]    Every finished turn ends with <nextsteps> or <nextsteps-complete/> (default)
/nextsteps optional            Suggestions only when a concrete follow-on exists
/nextsteps limit <n>           Max consecutive automatic turns: 5 | 10 | 20 | 50 | 100 | unlimited
```

`limit` accepts any whole number; `unlimited`, `sonsuz`, `∞`, and `0` all mean
no limit. Typing anything yourself re-arms the counter.

## How required mode ends a run

With no open todos, the leader's final response must end with one of:

- a `<nextsteps>` block — the first item becomes the next automatic prompt in
  `auto` autonomy, or
- `<nextsteps-complete/>` — the goal is achieved; nothing is proposed and the
  run stops. The marker is never shown in the chat.

If a response carries neither, the host asks the model once more, as a side
request that reuses the same prompt (cache-friendly) and is never added to the
conversation. Suggestions it returns are appended to the answer; the marker, an
empty reply, or a failed request appends nothing. Open todos always take
priority: while any is pending or in progress, no suggestions are produced and
auto-proceed continues the todo instead.

Runaway protection still applies: the limit above, and the loop guard that
halts when the same suggestion is fed back twice.

## Persistence and scope

The mode is user-owned. It is always written to the active profile — an
in-project `.wrongstack/config.json` cannot set it, even under
`configScope: project`. In the WebUI both values are per tab, like autonomy.

Other surfaces:

- **TUI settings** — "Require next steps" (Agent guidance) and
  "Auto-proceed max iterations" (5 / 10 / 20 / 50 / 100 / unlimited).
- **WebUI** — Settings → Execution, and the same `/nextsteps` command.
- **`/settings`** — shows both values.

## Related

- [`/autonomy`](autonomy.md) — turns `auto` on or off.
- [`/next`](next.md) — select or list the current suggestions.

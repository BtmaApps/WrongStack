## Delegation

Unless solo mode is on for this session, delegating is required — not optional — whenever the intent of the request calls for it. Before starting non-trivial work, read what the user actually wants and decide how it splits:

- **Independent parts.** Two or more substantial parts that each need real effort (their own reading, research, or several tool calls) and do not need each other's output: delegate each one in parallel.
- **A specialist fits non-trivial work.** A substantial part matches a roster role (review, security, testing, documentation, research, …) and benefits from dedicated specialist execution or context isolation: that role does it.

Do the work yourself whenever it is a single quick step, a localized 1–2 file edit or focused check you can finish faster in the current turn, strictly sequential work where each step needs the previous step's output, a task the user asked you to do personally, or when delegation was denied. Never spawn subagents for tiny chores that would only add round-trip delay. With solo mode on, spawning is refused: do the work yourself and do not look for a way around it.

**You choose each worker's effort — and, when the default does not fit, its model.** Set `effort` on every delegation, judged per task and per model: `low`/`minimal` for mechanical, well-specified edits or lookups, `medium` for ordinary work, `high`/`xhigh`/`max` for deep debugging, design, security or review where being wrong is costly. Add `tier` or `provider`/`model` when the work needs a cheaper or stronger model than the default.

{{modelMenu}}

The user's per-session model lanes may replace your provider/model; your effort still applies unless the user set one on that lane, and it is mapped onto the levels the worker's model supports.

Roster roles, by phase:
{{roleList}}

Set `role` only when you are sure of the id; otherwise omit both `role` and `name` and the task is routed to the best-matching specialist (a free-form `name` gets a generalist with no role skills).

Use `delegate` to hand a self-contained task to a subagent. It returns at once with a `delegationId`; the worker runs in the background and its final result is delivered to you automatically as a `[DELEGATION RESULT]` block tagged with that id. Do not poll, sleep, or re-await it — keep working, or end your turn when nothing else is useful (on hosts that support it a new turn starts when the result arrives; otherwise it is waiting at the start of your next turn). Several `delegate` calls in one turn fan out in parallel, and each result arrives as its worker finishes.

Pass `wait: true` only for short work whose verdict gates your very next step — a review, a fact-check, a sign-off. It blocks you until the worker returns and yields the full result inline.

<!--ws:if tool=spawn_subagent-->
Use `spawn_subagent` + `assign_task` + `await_tasks` when you need a reusable worker or want to decide yourself when results are collected. Calling `await_tasks` on a delegated task consumes its result in-band; it is not delivered a second time.
<!--ws:end-->

Omitting `provider`/`model` uses the session lanes, the routing table or your own model. Set `timeoutMs`/`maxIterations`/`maxToolCalls` per task needs. Narrow scope: "audit these 3 files" beats "audit the codebase".

Check `stopReason` on every result: `end_turn`=done, `budget_exhausted`=partial result, raise the matching limit.<!--ws:if tool=roll_up--> When the delivered excerpt is not enough, fetch the full output with `roll_up(["<taskId>"])`.<!--ws:end-->

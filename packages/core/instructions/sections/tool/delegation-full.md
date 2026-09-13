## Delegation

Use `delegate` to hand a self-contained task to a subagent (roles: {{roleList}}). It returns at once with a `delegationId`; the worker runs in the background and its final result is delivered to you automatically as a `[DELEGATION RESULT]` block tagged with that id. Do not poll, sleep, or re-await it — keep working, or end your turn when nothing else is useful (on hosts that support it a new turn starts when the result arrives; otherwise it is waiting at the start of your next turn). Several `delegate` calls in one turn fan out in parallel, and each result arrives as its worker finishes.

Pass `wait: true` only for short work whose verdict gates your very next step — a review, a fact-check, a sign-off. It blocks you until the worker returns and yields the full result inline.

<!--ws:if tool=spawn_subagent-->
Use `spawn_subagent` + `assign_task` + `await_tasks` when you need a reusable worker or want to decide yourself when results are collected. Calling `await_tasks` on a delegated task consumes its result in-band; it is not delivered a second time.
<!--ws:end-->

Omit `provider`/`model` to use defaults. Set `timeoutMs`/`maxIterations`/`maxToolCalls` per task needs. Narrow scope: "audit these 3 files" beats "audit the codebase".

Check `stopReason` on every result: `end_turn`=done, `budget_exhausted`=partial result, raise the matching limit.<!--ws:if tool=roll_up--> When the delivered excerpt is not enough, fetch the full output with `roll_up(["<taskId>"])`.<!--ws:end-->

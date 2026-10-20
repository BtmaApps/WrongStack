## Delegation

Unless solo mode is on, delegating is required when the request's intent splits into independent parts that each need real effort, or a part matches a specialist role; do it yourself only for a single quick step, strictly sequential work, or when the user asked you to. Use `delegate` for this; omit `role` and `name` to have the task routed to the right specialist, or set `role` when sure of the id. Roles by phase:
{{roleList}}

Set `effort` per task and per model on every delegation (low = mechanical, medium = ordinary, high+ = deep or costly-if-wrong); it survives the user's model lanes unless they set an effort there. Provider/model/budget default sensibly when omitted; override them only with a concrete reason.
{{modelMenu}}
 `delegate` runs in the background and its result is delivered to you automatically — do not poll; keep working or end your turn. Use `wait: true` only for short work whose verdict gates your very next step.

<!--ws:if tool=spawn_subagent-->
Use `spawn_subagent` + `assign_task` + `await_tasks` when you need a reusable worker or control over when results are collected.
<!--ws:end-->

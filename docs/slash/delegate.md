# /delegate — Hand a Task to a Specialist Subagent

User-facing counterpart to the AI's `delegate` tool.

## What it does

`/delegate` hands a task to a specialist subagent. With `--role`, it spawns
that specific role. Without `--role`, it uses smart dispatch (heuristic +
LLM classifier) to pick the best agent — the same engine as `/fleet dispatch`.

Director Mode is permanently on — delegate is always available. No `/director` or `--director` needed. Director Mode is hard-coded: `isDirectorMode()` always returns `true`, `ensureDirector()` always builds the Director, and the delegate tool is registered unconditionally in `brain-and-orchestration.ts`.

## The AI `delegate` tool runs in the background

The model-facing `delegate` tool does not block the leader. A call returns at
once with `{status:'running', delegationId, taskId}`; the worker runs in the
background, and when it settles its result is delivered to the leader
automatically as a `[DELEGATION RESULT]` block at the next iteration boundary.
If the leader is idle when a result arrives, the host starts a new leader turn
for it (auto-wake, `fleet.delegate.autoWake`, default on). ACP sessions only
start turns on `session/prompt`, so an ACP client gets a notice to send any
message and the result is injected on that prompt.

- `wait: true` on the tool call restores the blocking behaviour and returns the
  full result inline — meant for short work whose verdict gates the next step.
- `await_tasks` on the delegated task still works and consumes the result
  in-band; it is not delivered a second time. `roll_up(["<taskId>"])` returns
  the full result after delivery.
- Esc/Stop on the leader does not cancel a background delegation; stopping the
  session fleet does, and that outcome does not auto-wake.
- `fleet.delegate.defaultWait: true` (trusted config only) rolls the default
  back to blocking. See [configuration](../configuration.md#fleetdelegate--background-delegation-and-auto-wake).
- If you disabled the tool with `tools.disabledTools` because it froze the
  leader, re-enable it with `/tool enable delegate`.

The `/delegate` slash command itself is unchanged: it spawns the chosen role
directly (it does not go through the tool), so it neither blocks nor produces
a `[DELEGATION RESULT]` block.

## Usage

| Usage | Effect |
|---|---|
| `/delegate` | Show usage help |
| `/delegate <task>` | Auto-dispatch to best agent (heuristic + LLM) |
| `/delegate --role=<role> <task>` | Spawn a specific role |
| `/delegate --role=<role> --name=<label> <task>` | Spawn with custom display name |
| `/delegate list` | List all available agent roles grouped by phase |
| `/delegate roles` | Alias for `list` |
| `/delegate ls` | Alias for `list` |

## Examples

```bash
/delegate "audit packages/core for null-deref bugs"
/delegate --role=bug-hunter "find the race condition in session.ts"
/delegate --role=security-scanner --name=sec-audit "scan configs for secrets"
```

## Smart dispatch

When no `--role` is given, `/delegate` uses the same `dispatchAgent` engine as
`/fleet dispatch`:

1. **Heuristic matching** — scores the task against each agent's capability
   keywords (deterministic, instant)
2. **LLM fallback** — when the heuristic is ambiguous (confidence < threshold),
   the session's LLM provider picks the best role
3. **Decision preview** — the chosen role, confidence, and alternatives are
   shown before spawning

## Role validation

When `--role` is given, the role name is validated against the agent catalog.
If the role doesn't exist, all available roles are listed:

```
Unknown role "frobber". Available roles:
  accessibility, analyst, api, architect, audit-log, auth, backend,
  browser, bug-hunter, ...

Use /delegate list to browse by phase.
```

## Related commands

| Command | Difference |
|---|---|
| `/delegate` | Smart dispatch OR explicit role, with decision preview |
| `/fleet dispatch` | Smart dispatch only, fleet must be active, shows decision + spawns |
| `/fleet spawn <role>` | Spawn N subagents of a role without a task |
| `/spawn` | Fire-and-forget subagent with custom provider/model/tools |

## Code reference

- `packages/cli/src/slash-commands/delegate.ts`
- `packages/core/src/coordination/dispatcher.ts` — `dispatchAgent`
- `packages/core/src/coordination/agents/` — agent catalog (50 roles, 9 phases)

# `/solo` — Session worker policy

The TUI exposes a session-only subagent policy before the first message.

| Command | Policy |
|---|---|
| `/solo`, `/solo status` | Read mode and whether it is locked |
| `/solo on` | Block delegation, Chimera, background workers and companions |
| `/solo companions` | Block ordinary workers while allowing read-only memory/explore companions |
| `/solo off` | Allow workers subject to the normal fleet and permission controls |

Choose the mode before starting work. Once the runtime locks the session's
subagent policy, a change is refused and its reason is returned. This setting
does not disable tool execution by the leader or alter the profile's persistent
fleet settings. The policy is journaled as a session event so resume can restore
it. `off` permits spawning; it does not bypass role capabilities, budgets or depth limits.

Source: [`use-session-slash-commands.ts`](../../packages/tui/src/hooks/use-session-slash-commands.ts).
See [worker controls](spawn-agents.md), [companions](../architecture/explore-companion-subagent.md)
and [fleet budgets](fleet.md).

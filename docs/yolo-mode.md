# YOLO Mode

YOLO mode is WrongStack's broad auto-approval setting. When YOLO is on,
`DefaultPermissionPolicy` approves tool calls that were not blocked earlier by
explicit deny rules.

Current behavior:

- The stored config default (`BEHAVIOR_DEFAULTS.yolo`) is `false`. Interactive first launch currently selects YOLO on and persists that launch choice.
- `--yolo` forces broad auto-approval at startup. `--no-yolo` forces approval prompts and overrides both a saved YOLO preference and `--yolo`.
- What the user forbade makes YOLO **ask**, not refuse: a session "no", a
  trust-file deny pattern, a `/permissions deny` rule, a directory rule, or a
  deny list that cannot be checked for the call. YOLO's job is to run without
  interrupting, and to stop — by asking — only on damage and on these. The
  question has `source: 'yolo_user_rule'` / `riskTier: 'destructive'`: a host
  auto-answering prompts on a YOLO toggle leaves it to the user, an unanswered
  one is refused (never handed to the Brain), and an "always" answer runs it
  once without writing an allow rule — the deny rule stays. With YOLO
  off, and under YOLO+, the same rules refuse. Tools declared
  `permission: 'deny'` refuse at every level. The single rule is
  `refusalUnderYolo()` in `security/permission-helpers.ts`.
- A tool's own `permission: 'confirm'` declaration is **not** an input to the
  YOLO decision. Under YOLO the only question asked is
  `gatedDestructiveKind()` — see below. A tool that declares `confirm` because
  it mutates something is auto-approved in YOLO like any other; that
  declaration governs the non-YOLO path. Gating on it instead turns YOLO into a
  prompt on ordinary work, which is the thing YOLO exists to remove.
- YOLO still confirms **genuinely destructive** calls. The measure is "does
  this do large damage to the machine or the project", not "does this look
  dangerous". The nine categories live in `security/yolo-risk.ts`
  (`DestructiveKind`); `agent-state` and `credential-bind` are permanently
  locked because they are writes that can switch the approval system itself
  off.
- `agent-state` covers only the parts of `~/.wrongstack` a silent write could
  turn against the user (`security/agent-state-sensitivity.ts`): code that runs
  (`plugins/`, `updates/`, `automation/`, every `config*.json` and
  `config-history/`), approval state (`trust.json`, `plugin-trust.json`, session
  journals), secrets (`.key`, `auth.json`, `sync.json`), and instructions every
  session obeys (profile `instructions/`, `skills/`, `memory.md`, the global
  `AGENTS.md`). The agent's own working state there — plans, goals, specs, SDD
  boards, project memory, caches, logs — is written without a prompt. Links do
  not get around it: a benign name that resolves to a gated file is gated,
  `ln`/`mv` are judged by their source as well, and a directory input or an
  archive extracted where configs load is gated too.
- **YOLO+** (`/yolo plus`, `--yolo-plus`, `autonomy.yoloPlus`) is YOLO with
  nothing held back: no call ever asks — not the gated kinds, not the two
  locked ones, not a sensitive read or a Kanban scope boundary — and subagents
  are no longer refused what the leader would have asked about. The user's own
  refusals (a "no" this session, trust-file / `/permissions deny` / directory
  rules, `permission: 'deny'` tools) refuse — they are the one thing YOLO+ does
  not run. It never outlives YOLO,
  cannot be set by in-project or cloud-synced config, and `--restricted` locks
  it off. See [`/yolo`](slash/yolo.md).
- `--confirm-destructive`, `--yolo-destructive`, and `--force-all-yolo` select
  *which* of those categories still prompt (`autonomy.yoloConfirm`); the two
  locked kinds are re-added on every entry path.

## Quick Reference

| Surface | How to use it |
|---|---|
| CLI flags | `wrongstack --yolo`, `wrongstack --no-yolo` |
| Slash command | `/yolo`, `/yolo on`, `/yolo off`, `/yolo toggle` |
| Programmatic | `permissionPolicy.setYolo(true)` |

When YOLO is off, mutating or sensitive calls fall through to confirm prompts,
and trust-file deny rules and `permission: 'deny'` tools refuse.

## Approval Timeout

Any approval that still reaches a human surface waits for exactly 120 seconds.
If nobody answers, the active Brain arbitration chain decides whether that one
call may run — except a YOLO question about a rule the user wrote
(`yolo_user_rule`), which is refused: the Brain does not overrule the user's
own prohibitions. With no surface listening at all (headless, CI), a prompt is
refused at once for this run only; no deny rule is written to `trust.json`. The timed-out request cannot escalate back to the human; an
unavailable, failed, or inconclusive Brain decision rejects the call safely.
WebUI sends the deadline with the prompt and shows the remaining time.

## Permission Evaluation Order

Every tool call passes through `DefaultPermissionPolicy.evaluate()` before
execution. The first matching rule wins:

```text
1. Session soft deny          -> deny  (YOLO: confirm)
2. Trust file deny pattern    -> deny  (YOLO: confirm)
3. /permissions deny rule     -> deny  (YOLO: confirm)
4. Session soft allow         -> auto
5. Tool default deny          -> deny  (every level)
6. YOLO+                      -> auto  (deny if a deny list cannot be checked)
7. Trust file allow / auto    -> auto
8. YOLO                       -> confirm if a deny list cannot be checked or
                                 the call is a gated destructive kind, else auto
9. Smart bypass (write+read)  -> auto
10. Tool default              -> auto for non-mutating auto tools
11. Confirm prompt / event    -> confirm
```

Directory rules (`DirectoryPermissionPolicy`) run before all of this and follow
the same rule: refuse when off or under YOLO+, ask under YOLO — unless the inner
policy refuses the call outright.

## Runtime Toggle

YOLO can be toggled during a REPL/TUI session:

```text
/yolo           show current status
/yolo on        enable YOLO
/yolo off       disable YOLO
/yolo toggle    flip current state
```

The slash command accepts these arguments:

| Argument | Effect |
|---|---|
| `on`, `enable`, `true`, `1` | Enable |
| `off`, `disable`, `false`, `0` | Disable |
| `toggle` | Flip |

## Source Values

Permission decisions can report these relevant sources:

| Source | Meaning |
|---|---|
| `yolo` | Auto-approved because YOLO mode is active |
| `yolo_destructive` | YOLO stopped to ask: a gated destructive kind |
| `yolo_user_rule` | YOLO stopped to ask: a rule the user wrote forbids this call (only the user answers it) |
| `trust` | Matched an allow rule or trust-file auto flag |
| `deny` | Explicitly denied by a pattern or tool declaration |
| `user` | User answered a permission prompt |
| `context` | Smart bypass, such as writing a file already read this session |
| `default` | Tool's own declared permission level |

## Session-Scoped Soft Rules

When the user answers a permission prompt, the policy can remember the answer
for the rest of the session:

| Answer | Effect |
|---|---|
| `y` | `allowOnce()` auto-approves this tool/pattern once for the immediate re-run |
| `n` | `denyOnce()` blocks this tool/pattern for the session (under YOLO it asks again instead) |
| `a` | `trust()` writes a permanent allow rule to `trust.json` |
| `d` | `deny()` writes a permanent deny rule to `trust.json` |

The one-shot allow entry is consumed on first use. The session maps are also
cleared when the trust file is reloaded.

## Security Notes

| Concern | Mitigation |
|---|---|
| Accidental destructive commands | Keep YOLO off when you want per-call review; use explicit trust-file deny rules for hard blocks |
| Project-boundary escape | Filesystem tools refuse reads/writes outside the active project root by default (`tools.restrictToProjectRoot: true`); explicit `features.allowOutsideProjectRoot` is the only way to opt out |
| YOLO left on unintentionally | TUI status and `/yolo` show the current state |
| Subagent privilege escalation | Subagents use `AutoApprovePermissionPolicy`, which denies dangerous capabilities, MCP tools, and legacy risky names by default |
| Trust file poisoning | Trust is per project at `~/.wrongstack/projects/<hash>/trust.json`; encrypted secrets are separate |
| Reviewing code you do not trust | `wstack --restricted` (below) |

### `--restricted`

For a run over code you do not trust yet — a stranger's repository, a fork you
are triaging. The agent keeps reading, searching and editing inside the
project; for the whole process it loses:

- every tool declaring a shell, network, package-install, config-mutation,
  outside-project-write or `tool.mutate.any` capability (by capability, so a
  newly added tool is covered too), plus every MCP tool — configured MCP
  servers are not started;
- plugin tools that declare no capabilities at all (unknown fails closed);
- leaving the project root, including through `/settings`;
- YOLO, including `/yolo on`, WebUI, HQ and per-tab toggles — every write asks.

Subagents inherit the same tool surface. `--yolo`, `--yolo-destructive`,
`--full-auto`, `--mcp-config` and `--allowed-tools` are refused alongside it
(exit 2) rather than silently winning or losing. `WRONGSTACK_RESTRICTED=1` is
equivalent and is exported to child processes. It is not an OS sandbox: it
limits what the agent's tools can do, not what the WrongStack process can do.

Example defensive trust rules:

```jsonc
// ~/.wrongstack/projects/<hash>/trust.json
{
  "bash": {
    "deny": [
      "rm -rf /*",
      "DROP TABLE*",
      "DELETE FROM*"
    ]
  },
  "write": {
    "deny": ["~/.ssh/*", "~/.gnupg/*", "/etc/*"]
  }
}
```

## Programmatic Usage

```ts
import { DefaultPermissionPolicy } from '@wrongstack/core';

const policy = new DefaultPermissionPolicy({
  trustFile: '/path/to/trust.json',
  yolo: true,
});

policy.setYolo(false);

const isYolo = policy.getYolo();
const destructiveGate = policy.getConfirmDestructive(); // deprecated compatibility state
```

For subagents:

```ts
import { AutoApprovePermissionPolicy } from '@wrongstack/core';

const subagentPolicy = new AutoApprovePermissionPolicy();
```

## Code Reference

- `packages/core/src/security/permission-policy.ts`
- `packages/cli/src/arg-parser.ts`
- `packages/cli/src/slash-commands/yolo.ts`

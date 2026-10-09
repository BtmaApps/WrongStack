# /yolo - Auto-Approve Tool Calls

## What It Does

Three levels, from most to least supervised:

| Level | What asks |
|---|---|
| **off** | Every tool call that is not pre-approved |
| **on** (YOLO) | Calls whose damage is still gated (`/yolo confirm`), the two locked kinds (`agent-state`, `credential-bind`), and every call your own deny rules forbid |
| **plus** (YOLO+) | Nothing. Every call runs: the destructive kinds, the locked ones, sensitive reads, Kanban scope boundaries — and subagents are no longer refused what the leader would have asked about |

What happens to a call **you** forbade — an earlier "no" this session, a
trust-file deny pattern, a `/permissions deny` rule, a directory rule, or a deny
list that cannot be checked for this call:

| Level | Your refusal |
|---|---|
| off | refuses |
| YOLO | **asks** — YOLO never interrupts for ordinary work, but it stops on what you forbade and lets you decide that one call. A "yes" covers that call only; the rule stays. |
| YOLO+ | refuses — YOLO+ asks nothing, so your prohibitions are the one thing it does not run |

These questions carry the destructive tier, so turning YOLO on in the WebUI
never auto-answers them. Only you answer them: left unanswered they are refused
rather than handed to the Brain, and they offer no "Always" — an always answer
from another surface runs the call once and leaves your rule in place. To lift
the rule, change it with `/permissions` or in the trust file. A tool that is `permission: 'deny'` by its own
declaration refuses at every level (it is not a rule you wrote). Subagents
cannot ask, so for them a refusal stays a refusal.

## Usage

| Usage | Effect |
|---|---|
| `/yolo` | Show the current level |
| `/yolo on` | YOLO — gated kinds still ask (drops YOLO+ back to YOLO) |
| `/yolo plus` | YOLO+ — nothing ever asks (also `/yolo +`, `/yolo all`) |
| `/yolo off` | Prompts for everything (also leaves YOLO+) |
| `/yolo toggle` | Flip YOLO on/off |
| `/yolo confirm` | List which kinds still ask under YOLO |
| `/yolo confirm <kind> on\|off` | Keep asking for, or stop asking for, one kind |

`on`/`off` also accept `enable`, `true`, `1`, `disable`, `false`, and `0`.

## YOLO+

- It is YOLO with nothing held back: turning it on turns YOLO on, and turning
  YOLO off always leaves YOLO+ — "off" can never mean "everything allowed".
- Per conversation, like YOLO: in the WebUI each tab has its own — and so do
  that tab's subagents. One tab's YOLO+ never reaches another tab's workers
  (`subagentYoloPlus` in `security/session-yolo.ts`). The last choice is saved
  as the default a newly opened tab starts from, as with YOLO.
- User-owned: a project's `.wrongstack/config.json` and cloud-synced config
  cannot set `autonomy.yoloPlus`, and `--restricted` locks it off.
- Prompts already on screen when it is turned on in the WebUI are answered.
- Persist it with `autonomy.yoloPlus: true` in your profile config, or start a
  session in it with `--yolo-plus`.

The status line shows `YOLO+` instead of `YOLO` while it is active.

## Tool-side behavior

The executor passes the effective conversation mode to both ordinary and streaming
tools after authorization. A WebUI tab's mode takes precedence over the process
default; ordinary subagent auto-approval does not imply YOLO, while explicit
leader YOLO+ is inherited by its workers.

| Control | Prompt mode | YOLO / YOLO+ |
|---|---|---|
| `exec` command roster | Default roster plus configured allow entries | Additional executable names and paths may run |
| `tools.exec.deny` | Refuses | Refuses, including an executable path whose basename is denied |
| `exec` publish/deploy verb block | Refuses | Central permission policy decides; plain YOLO may still ask for the publish kind |
| `exec` argument count | Every supplied argument is preserved | Every supplied argument is preserved |
| `exec` explicit timeout | Capped at ten minutes | Longer durations are honored; `timeout: 0` disables the command timer while parent cancellation remains active |
| Git development options through `exec` | Existing option restrictions apply | `git -C <directory>` follows the configured filesystem scope; temporary color, line-ending, long-path and diff settings with `git -c key=value` are accepted |
| Private development URLs | One exact project origin allowance | The same project allowance is reused across browser, `fetch` and `read_url_content` |
| Selected working directory | `test`, `lint`, `format`, `typecheck` and `install` follow the session directory | Same behavior; an explicit `cwd` overrides it |

Use `/network allow http://localhost:3000` (alias of `/browser allow`) once for
your trusted development server. Scheme, host and port must match. Revoke it
with `/network remove http://localhost:3000`; redirects to other origins need
their own allowance. Network refusals show the exact command in the TUI.
Loopback shortcuts work too: `/network allow localhost:3000`,
`/network allow 127.0.0.1:3000`, or `/network allow [::1]:3000`. They normalize
to one exact HTTP origin and support the same `remove` command.

Git directory flags are checked against the session's existing filesystem
scope, then passed as resolved paths. The accepted temporary config keys
cover `color.ui`, `color.diff`, `color.status`, `color.branch`, `color.decorate`,
`core.autocrlf`, `core.eol`, `core.longpaths`, `core.quotepath`, `core.filemode`,
`core.ignorecase`, `diff.algorithm`, `diff.renames`, `diff.context`,
`diff.mnemonicprefix`, `diff.noprefix`, and `advice.detachedhead`.
Their options no longer produce a generic danger banner; the actual Git
operation still determines the assessment and permission decision.

Tool input validation, configured filesystem scope, enforced sandbox tiers,
browser ownership, protected WrongStack processes, TLS validation and bounded
memory remain runtime controls at every approval level. `git` searches to the
project boundary instead of stopping after an arbitrary 20 parent directories.
The built-in `pnpm deploy <folder>` prepares a local portable package and does
not trigger the external-publish gate; `pnpm run deploy` remains gated because
that user-defined script may publish or deploy externally.

## CLI Flags

| Flag | Effect |
|---|---|
| `--yolo` | YOLO on for this launch |
| `--yolo-plus` | YOLO+ on for this launch |
| `--no-yolo` | Prompts for everything; wins over both flags above |
| `--yolo-destructive` | Stop asking for every kind you may un-gate (the locked two still ask) |
| `--confirm-destructive`, `--force-all-yolo` | Compatibility flags |

## Code Reference

- `packages/cli/src/slash-commands/yolo.ts`
- `packages/core/src/security/permission-policy.ts` (`effectiveYoloPlus`)
- `packages/core/src/security/auto-approve-policy.ts` (subagents, `yoloPlus` option)
- `packages/core/src/security/yolo-risk.ts` (destructive kinds)

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

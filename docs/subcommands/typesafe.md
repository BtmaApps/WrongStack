# `wstack typesafe` — Jev account and diagnostics

`typesafe` is the shell name for Jev controls. It is an auxiliary typed decision
service, not a chat provider in `wstack auth`.

```bash
wstack typesafe status
wstack typesafe login --route typesafe
wstack typesafe on
wstack typesafe test
```

| Action | Purpose |
|---|---|
| `status` (default) | Account and consumer configuration |
| `on`, `off` | Enable/disable all requests, retaining the key |
| `login [--route id] [--endpoint URL] [--model id]` | Store account settings/key in the active profile |
| `test` | One live question and connection result |
| `lint-conventions` | Judge convention hits in a staged/base diff |
| `check-judgments` | Live known-case judgment checks |
| `replay-brain-ledger` | Compare Jev with recorded Brain decisions |
| `replay-topic-shift` | Compare Jev/provider behavior on saved session prompts |
| `replay-memory-triage` | Compare Jev/LLM decisions on SAGE gray-zone memories |

Diagnostics send the selected evidence to configured services and can incur
cost. Convention lint accepts `--staged` or `--base <ref>`, `--threshold` and
`--json`; its rules combine built-ins with `.wrongstack/semantic-lint.json`
and findings return exit 1. Replay supports command-specific limits, selectors
and structured output; use `wstack typesafe help` for the complete flags.
Topic/memory replay's `--no-llm` suppresses that comparison channel, not every
Jev request.

Saved readiness and synthetic success are different from runtime use. Inspect
[/jev logs](../slash/jev.md) for process activity and the disk-log path.

Source: [`typesafe.ts`](../../packages/cli/src/subcommands/handlers/typesafe.ts).
See [account resolution](../typesafe-account.md),
[settings/activity](../jev-settings-and-activity.md) and
[skill routing evaluation](skill-suggest.md).

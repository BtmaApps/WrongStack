# `/scout-stats` — is the Scout identity doing what its prompt asks?

`/scout-stats [sessions]` reads the last N session journals of the current project (default 20, max 200) and compares the system-prompt identity variants — Scout against Lite, Standard, and Pro — on the two behaviours Scout exists for: finding tools on demand and delegating work.

Nothing extra is recorded for it. Every `llm_request` journal event carries the `systemVariant` it ran under, tool calls are journaled as `tool_call_start`, and the report is aggregated when the command runs. Journals written before requests recorded their variant appear as `unrecorded`.

## What it reports, per variant

| Line | Meaning |
|------|---------|
| tokens/run | Input + output tokens per user turn. |
| tool calls | All tool calls, and the share routed through `tool_use` (schema not sent directly). |
| tool_search | Searches, the share that came back empty, and `found→used`: `tool_use` calls whose target an earlier search in the same run returned. |
| delegation | `delegate` / `spawn_subagent` calls (direct or through `tool_use`) and the share of runs that delegated at least once. |
| solo-heavy runs | Runs with 8 or more tool calls and no delegation — the work Scout's prompt says to split. |

A run starts at each user input and belongs to the variant of its first request.

## Reading it

- A high **empty** share means the model asks `tool_search` for capabilities in words the catalog does not use; extend the synonym table in `packages/tools/src/tool-search.ts`.
- **found→used** well below the number of searches means searches return the wrong tools, or the model gives up after searching.
- Many **solo-heavy runs** under Scout mean the delegation rule is not taking hold; check the session's subagent policy first — under solo, delegation is intentionally off.

Source: `packages/cli/src/slash-commands/scout-stats.ts`.

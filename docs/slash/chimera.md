# `/chimera` — Post-session reviewer status

`/chimera` is registered by the `wstack-chimera` plugin, which ships enabled by default; the command is present **only when that plugin's resolved `enabled` option is true**. It reports:

- whether Chimera is enabled;
- the provider and model selected for its review subagent;
- the maximum number of changed files considered;
- the manual follow-up policy; and
- that output uses the provider's model-native ceiling.

## Subcommands

| Command | Effect |
|---------|--------|
| `/chimera` | Show current status. |
| `/chimera autoFix <off\|ask\|auto>` | Compatibility command; explains that follow-ups are manual. |

Every mode is now passive: the full report is persisted and sent to the mailbox,
while TUI, WebUI, and SimpleUI receive a compact “report ready” notice. Reports
never resume the leader. Findings at or above the `cascadeOn` threshold (`high`
by default) trigger the correction cascade — security-scanner and/or bug-hunter
agents spawned to investigate and fix, bounded by `maxCascadeDepth`. Successful
explicit “all clear” reports are completed automatically; findings below the
threshold wait for the user to inspect them and explicitly request action.

Every completed review is durably written before the runtime publishes its completion event, regardless of whether it came from manual review, auto-review, cascade, or the post-session Chimera plugin. The project-scoped stores are:

- `~/.wrongstack/projects/<slug>/review-reports.jsonl` — full report text, provenance, counts, and report lifecycle;
- `~/.wrongstack/projects/<slug>/review-findings.jsonl` — parsed findings and finding lifecycle.

Mailbox delivery remains a separate notification channel backed by the project mailbox. Disabling the `wstack-chimera` plugin does not disable persistence for reviews produced by auto-review.

Store mutations and compaction are coordinated with cross-process file locks. Once the combined JSONL size reaches 8 MiB, retention compaction runs at most once per 24 hours: completed/skipped reports are retained for 90 days, resolved findings for 30 days, and ignored findings for 14 days. Reports that were never closed out (`open`/`actioned`) are bounded separately at 180 days, so an unacknowledged review stops accumulating forever; that window is deliberately longer than the 90-day terminal one, and it can be disabled with `Number.POSITIVE_INFINITY` by a caller of `maybeCompactReviewStores`. Compaction replaces files atomically and malformed/truncated JSONL lines are skipped during recovery.

Use the core [`/review`](review.md) command to request a manual changed-file review. Chimera's automatic review is driven by the `session.ended` event, not by invoking `/chimera`.

Configuration is read from `extensions["wstack-chimera"]`.

### Configuration keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch. The plugin registers `/chimera` only when `true`. |
| `provider` | string | session provider | LLM provider for the review subagent. |
| `model` | string | session model | LLM model for the review subagent. |
| `maxFiles` | number | `15` | Maximum changed files considered per review. |
| `autoFix` | `off` \| `ask` \| `auto` | `off` | Manual follow-up policy (all modes are passive — reports are advisory). |
| `cascadeOn` | `off` \| `critical` \| `high` | `high` | Severity threshold for triggering cascade follow-up reviews. |
| `maxCascadeDepth` | number | `2` | Maximum cascade re-check depth. |
| `openRetentionDays` | number | `180` | Store-maintenance cap, in whole days, for review rows still in a non-terminal lifecycle (`open`/`actioned`) — normally every report that produced findings, since only an all-clear report auto-completes. Rows older than this are dropped by the next compaction pass; terminal (`completed`/`skipped`) rows are not affected by this cap and keep their own 90-day retention. `0` disables the sweep; a negative, `NaN` or non-finite value is treated as unset, so the default applies. Read by `maybeCompactReviewStores`, not by the reviewer, so it does not appear in `resolveChimeraConfig`. |
| `activeRetentionDays` | number | `60` | Same bounded-retention cap for the **finding** store, in whole days, for findings that never reached a terminal status (`active`/`triaged`/`in_progress`). A finding nobody ever resolves or ignored used to survive at any age. Default is 2x the longest terminal finding window (resolved 30d / ignored 14d), so an untriaged finding outlives a resolved one; `resolved`/`ignored` keep their own 30d/14d windows and are never reached by this cap. Same `0` = disabled and garbage = default rules. |
| `fallbackModels` | string[] | `[]` | Chimera-specific fallback model chain (`provider/model` refs). When non-empty, the reviewer subagent uses these models as its in-request fallback chain before falling back to the session-level chain. Example: `["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"]`. |
| `fallbackProfile` | string | — | Named profile from `config.fallbackProfiles`. When set, the reviewer spawn resolves this profile's chain and merges it into the fallback ladder ahead of the session-level profile. Takes precedence over the session-level fallback for Chimera spawns only. |

Example config:

```json
{
  "extensions": {
    "wstack-chimera": {
      "enabled": true,
      "provider": "deepseek",
      "model": "deepseek-chat",
      "fallbackModels": ["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"],
      "fallbackProfile": "reliable",
      "maxFiles": 20,
      "autoFix": "off",
      "cascadeOn": "high",
      "maxCascadeDepth": 2
    }
  }
}
```

The fallback ladder for a Chimera reviewer spawn is built in this order:

1. **Primary** — the configured `provider`/`model` (or the session model if unset).
2. **Chimera fallback chain** — `fallbackModels` entries, then the resolved `fallbackProfile` chain.
3. **Session fallback chain** — the active session-level `effectiveFallbackChain`.
4. **Session model** — guaranteed last resort.

The ladder deduplicates by `provider/model`, so overlap between the Chimera chain and the session chain is harmless. Each rung costs a full subagent spawn; the ladder is capped at 4 attempts, with the session model always retained as the final entry.

## Code reference

- `packages/core/src/plugins/chimera-plugin.ts`
- `packages/cli/src/execution-chimera-review.ts`

# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T16:17:05.441Z; skill=chimera; applied=1; wins=1; skipped=35; skippedWins=35 -->
- **Always validate a realpath walk-up path guard in three checks before flagging or trusting it in `packages/bench/src/graders/restore-files.ts` `inside()`: (a) non-`ENOENT` errno fails closed, (b) each `ENOENT` probe is `lstat`-checked for a dangling symlink, and (c) the walk terminates at `rootAbs` — and containment must compare against `fs.realpath(root)`, never the lexical root, so symlinked workdirs (CI `/tmp` → `/private/tmp`) don't false-reject. [skill: chimera] ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/bench/src/graders/restore-files.ts`
  - *How:* `inside()`
  - *How:* `ENOENT`
  - *How:* `lstat`
  - *How:* `rootAbs`
  - *How:* `fs.realpath(root)`
  - *How:* `/tmp`
  - *How:* `/private/tmp`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T18:39:06.153Z; skipped=1; skippedWins=1 -->
- **Always verify SimpleUI pref-select diffs against the serve/seed path, not just the update validator: `packages/webui-server/src/server/context-meta.ts` seeds numeric prefs with only a `typeof === 'number'` check (no range clamp), so a hand-edited fractional/zero value reaches the panel unclamped — the correct client-side defense is `presetOptions`'s `Number.isInteger && >= floor` union guard, which must never re-offer such values as options. Pair it with `pref-helpers.ts` allowed-keys and `prefs-model.ts` required-field defaults to prove the write path is live wiring. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-server/src/server/context-meta.ts`
  - *How:* `typeof === 'number'`
  - *How:* `presetOptions`
  - *How:* `Number.isInteger && >= floor`
  - *How:* `pref-helpers.ts`
  - *How:* `prefs-model.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T08:25:19.601Z; applied=2; wins=2; skipped=54; skippedWins=54 -->
- **Never let a model-controlled `limit` reach `Array.prototype.slice` unchecked — `slice(0, -n)` means "drop the last n elements", so a negative limit silently returns almost the entire array instead of an empty page, and `slice(0, NaN)` returns empty while `x ?? default` does NOT catch NaN. Route such values through the package's `clampLimit` (or floor-and-clamp inline) before any `slice`/SQL `LIMIT` binding.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `limit`
  - *How:* `Array.prototype.slice`
  - *How:* `slice(0, -n)`
  - *How:* `slice(0, NaN)`
  - *How:* `x ?? default`
  - *How:* `clampLimit`
  - *How:* `slice`
  - *How:* `LIMIT`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T16:52:20.766Z; skipped=23; skippedWins=23 -->
- **When grepping locale JSON for `{{placeholder}}` parity, never use `"[^"]*\{\{token\}\}` patterns — `[^"]*` cannot cross JSON-escaped quotes (`\"`) inside values like `"Fallback profile \"{{name}}\" added"` in `packages/webui/src/i18n/locales/*/settings.json`, producing false per-locale mismatches (locales using guillemets like fr match while quote-escaping locales don't). Grep for the placeholder token and the key name separately, or use `[^}]*` on the placeholder side. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `{{placeholder}}`
  - *How:* `"[^"]*\{\{token\}\}`
  - *How:* `[^"]*`
  - *How:* `\"`
  - *How:* `"Fallback profile \"{{name}}\" added"`
  - *How:* `packages/webui/src/i18n/locales/*/settings.json`
  - *How:* `[^}]*`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-01T09:58:25.067Z; skill=chimera; applied=1; wins=1; skipped=44; skippedWins=44 -->
- **When reviewing a diff that replaces `chunk.toString('utf8')` with `StringDecoder.write()` in a byte-capped capture path (e.g. `packages/bench/src/exec-command.ts`), verify three things in one pass: the flush on completion is guarded by a `!truncated` check so a mid-sequence cut never emits `U+FFFD`; the trailing-continuation-byte walk-back still detects mid-sequence cuts when the decoder holds a prefix from the previous chunk; and any new byte-budget normalization rejects `NaN`/`Infinity` before the value reaches `remaining`. A guard missing on the flush is the realistic defect — the walk-back and the decoder coexist correctly on their own.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `chunk.toString('utf8')`
  - *How:* `StringDecoder.write()`
  - *How:* `packages/bench/src/exec-command.ts`
  - *How:* `!truncated`
  - *How:* `U+FFFD`
  - *How:* `NaN`
  - *How:* `Infinity`
  - *How:* `remaining`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T08:25:19.601Z; applied=2; wins=2; skipped=54; skippedWins=54 -->
- **Always distinguish the two same-named `clampLimit` helpers before judging a call site: `packages/webui-server/src/server/ws-validation-common.ts` exports `(value: unknown, def: number, max: number)` (re-exported via `ws-payload-validation.ts`; `< 1 → 1`, `> max → max`), while `packages/core/src/chronicle/metrics-schema.ts` exports `(limit, fallback)` with a hard 10 000 cap. Arity mismatches are caught by typecheck, but severity/behavior judgments (e.g. whether NaN falls to default) depend on which module the import resolves to — read the actual helper, not the name.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `clampLimit`
  - *How:* `packages/webui-server/src/server/ws-validation-common.ts`
  - *How:* `(value: unknown, def: number, max: number)`
  - *How:* `ws-payload-validation.ts`
  - *How:* `< 1 → 1`
  - *How:* `> max → max`
  - *How:* `packages/core/src/chronicle/metrics-schema.ts`
  - *How:* `(limit, fallback)`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T10:07:14.495Z; skipped=44; skippedWins=44 -->
- **Always resolve `computeStableJsonHash`/`computeTextHash`-style hash suffixes against their live definition in `packages/bench/src/fingerprint.ts` before judging path-safety — `shortHash` is sha256-hex (12 chars), so hash-derived filename/directory suffixes are guaranteed separator-free and safe to append to `slug()` output in `packages/bench/src/**`. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `computeStableJsonHash`
  - *How:* `computeTextHash`
  - *How:* `packages/bench/src/fingerprint.ts`
  - *How:* `shortHash`
  - *How:* `slug()`
  - *How:* `packages/bench/src/**`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:49:36.008Z; skill=chimera; applied=1; wins=1; skipped=23; skippedWins=23 -->
- **Always verify i18n namespace parity with one `glob packages/webui/src/i18n/locales/*/settings.json` plus one `grep <newNamespace>` before clearing a locale-string diff — the diff shows only touched files, while the real contract is that *every* locale directory received the identical key set with matching `{{placeholder}}` tokens, consumed by the sibling component (e.g. `FallbackSuggestionsPanel.tsx` reading `settings:fallbackSuggest.*`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob packages/webui/src/i18n/locales/*/settings.json`
  - *How:* `grep <newNamespace>`
  - *How:* `{{placeholder}}`
  - *How:* `FallbackSuggestionsPanel.tsx`
  - *How:* `settings:fallbackSuggest.*`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:55:08.379Z; applied=3; wins=3; skipped=1; skippedWins=1 -->
- **Always verify which side of the prefs pipeline a numeric clamp lives on before trusting a `<select>` that renders a stored server pref (e.g. `tgPollIntervalSec` feeding `pollIntervalOptions` in `packages/simpleui/src/settings-panel.tsx`): a clamp applied only on `prefs.update` write still lets a hand-edited config value reach the panel unclamped, where the select silently displays its first option instead of the stored value — confirm the clamp runs in the prefs broadcast/serve path (`packages/webui-server/src/server/ws-payload-preferences.ts` / `pref-helpers.ts`), not only in the update validator.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `<select>`
  - *How:* `tgPollIntervalSec`
  - *How:* `pollIntervalOptions`
  - *How:* `packages/simpleui/src/settings-panel.tsx`
  - *How:* `prefs.update`
  - *How:* `packages/webui-server/src/server/ws-payload-preferences.ts`
  - *How:* `pref-helpers.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T17:36:08.903Z; skill=chimera; applied=1; wins=1; skipped=10; skippedWins=10 -->
- **When a cross-package source-pin regex is updated (e.g. `packages/webui/tests/lib/kanban-board-active.test.ts` pinning `packages/webui-server/src/server/kanban-route-pagination.ts`), always grep the twin file for the exact new literal AND confirm the old regex cannot also match the new text — an update where both patterns match is a vacuous pin, and one where neither matches means the test now guards nothing it was written to guard.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui/tests/lib/kanban-board-active.test.ts`
  - *How:* `packages/webui-server/src/server/kanban-route-pagination.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T09:58:25.067Z; skill=code-review; applied=2; wins=2; skipped=43; skippedWins=43 -->
- **When a diff adds pass-through option fields to a host-embedded seam interface (e.g. `StaticServeOptions` in `packages/webui-server/src/server/frontend-static-serve.ts`), grep each field name in the target options type before judging and confirm each is threaded at the single construction call site. Judge the exposure question explicitly: fields sourced only from host config (not from HTTP request bodies, query strings, or WS frames) add no new attack surface, so the change is additive wiring rather than a security regression.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `StaticServeOptions`
  - *How:* `packages/webui-server/src/server/frontend-static-serve.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T16:26:06.755Z; skill=chimera; applied=1; wins=1; skipped=29; skippedWins=29 -->
- **When a diff mounts a sibling UI component that issues a WS request on mount, verify the full live contract before clearing it — the component file on disk, its prop interface versus every passed prop (exact callback arities), and the WS seam (`suggestFallbacks` in `packages/webui/src/lib/ws-client-domain-methods.ts` plus the message type in `packages/webui/src/types/server-message.ts` union) — because an unconditionally mounted panel turns a dead method reference into a runtime break, while a type-mismatched callback fails silently at the call boundary. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `suggestFallbacks`
  - *How:* `packages/webui/src/lib/ws-client-domain-methods.ts`
  - *How:* `packages/webui/src/types/server-message.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-01T09:40:51.592Z; skill=chimera; applied=3; wins=3; skipped=45; skippedWins=45 -->
- **When a diff splits a sum helper into typed variants (e.g. `counterSum` vs `finiteSum` in `packages/bench/src/aggregate.ts`), verify each call site uses the variant matching its metric domain: integer counters get the `Number.isSafeInteger && >= 0` filter, while continuous telemetry (cost, tokens) must stay on the finite-only path — a float metric routed through the integer variant would silently read as 0 instead of being summed. Confirm the old helper name has no surviving references and was module-private before judging a rename complete. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `counterSum`
  - *How:* `finiteSum`
  - *How:* `packages/bench/src/aggregate.ts`
  - *How:* `Number.isSafeInteger && >= 0`
  - *How:* `json { "findings": [] }`

---
*Last capture: 2026-10-01T18:39:06.153Z · 13 entries*

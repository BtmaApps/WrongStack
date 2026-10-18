# Learned instructions for `audit-log`

> Project-specific learning data for the `audit-log` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T09:42:50.640Z; skill=audit-log -->
- **Before reporting a live unhandled rejection in `packages/mcp` or `packages/acp`, check these containment anchors: `EventBus.emit` isolates every listener throw (`packages/core/src/kernel/events.ts`), `recordRegistryOperation` isolates operation listeners (`packages/mcp/src/registry-operations.ts`), and crash shields recover+log unhandled rejections in CLI/desktop hosts (`packages/cli/src/cli-entry-point.ts` `runCliProcess`, `apps/desktop/src/main/main.ts` `boot`, `packages/tools/src/process-guardian.ts`) — a genuine escape is fatal only in third-party embeds without shields.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/mcp`
  - *How:* `packages/acp`
  - *How:* `EventBus.emit`
  - *How:* `packages/core/src/kernel/events.ts`
  - *How:* `recordRegistryOperation`
  - *How:* `packages/mcp/src/registry-operations.ts`
  - *How:* `packages/cli/src/cli-entry-point.ts`
  - *How:* `runCliProcess`
  - *How:* `apps/desktop/src/main/main.ts`
  - *How:* `boot`
  - *How:* `packages/tools/src/process-guardian.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T09:42:50.640Z; skill=bug-hunter -->
- **When no process-execution tool is registered, replicate `.temp_files/core_fire_and_forget_scan/scan.mjs` semantics exactly via grep + reads — its CALLBACK regex is literal (`\.on\(` does NOT match `.onMessage(`, `.onClose(`, `createServer(`, `.addXxxListener(`) and its two-arg `.then` exclusion (scan.mjs:46) only recognizes arrow-function second args, so identifier handlers like `then(resolve, reject)` are flagged despite being contained. Reproduce both quirks or the hit set diverges from the scanner's.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/core_fire_and_forget_scan/scan.mjs`
  - *How:* `\.on\(`
  - *How:* `.onMessage(`
  - *How:* `.onClose(`
  - *How:* `createServer(`
  - *How:* `.addXxxListener(`
  - *How:* `.then`
  - *How:* `then(resolve, reject)`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-18T09:39:10.749Z; applied=1; wins=1 -->
- **Always enumerate every `void <call>(` line with grep before trusting `.temp_files/core_fire_and_forget_scan/scan.mjs` results — its CALLBACK regex only scans 6 lines ABOVE the void, so registrations that follow the call (`addEventListener` in `packages/tools/src/browser/manager-support.ts` abortable) and createServer-style handler shapes (`packages/tools/src/browser/network-guard-proxy.ts`) are invisible to it. Trace void'd callees across package boundaries (`packages/core/src/utils/heap-watchdog.ts`, `packages/persistence/src/project-endpoint.ts`) — rejection safety is decided in the callee, not the call site. Remember `.finally(` on a void'd promise does NOT handle rejection, and `try/finally` without `catch` (parser-worker-pool reparseInline pattern) still leaks rejections.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `void <call>(`
  - *How:* `.temp_files/core_fire_and_forget_scan/scan.mjs`
  - *How:* `addEventListener`
  - *How:* `packages/tools/src/browser/manager-support.ts`
  - *How:* `packages/tools/src/browser/network-guard-proxy.ts`
  - *How:* `packages/core/src/utils/heap-watchdog.ts`
  - *How:* `packages/persistence/src/project-endpoint.ts`
  - *How:* `.finally(`
  - *How:* `try/finally`
  - *How:* `catch`

---
*Last capture: 2026-10-18T09:42:50.640Z · 3 entries*

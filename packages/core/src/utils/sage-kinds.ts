/**
 * Every SAGE memory kind as a runtime list — the one vocabulary the CLI, TUI
 * and WebUI offer for `--kind` validation, kind pickers and kind filters.
 *
 * It lives in core (dependency-free, its own subpath) because the browser
 * bundle cannot import `@wrongstack/sage`. Three hand-copied 12-kind lists had
 * drifted from the engine's 20 kinds (the 2026-08-08 kinds were missing), so
 * `/memory remember --kind tool_outcome` was rejected by the CLI/TUI while the
 * engine accepted it, and the WebUI could neither filter nor pick them.
 *
 * `packages/sage/tests/sage-kinds-parity.test.ts` pins this list to the
 * engine's `VALID_KINDS` / `SAGE_KINDS`; add a kind there and here together.
 */
export const SAGE_MEMORY_KINDS = [
  'fact',
  'decision',
  'convention',
  'preference',
  'warning',
  'anti_pattern',
  'workflow',
  'bug_root_cause',
  'file_note',
  'symbol_note',
  'command_note',
  'summary',
  'memory_review',
  'tool_outcome',
  'error_pattern',
  'session_digest',
  'role_operational',
  'task_outcome',
  'security_signal',
  'fleet_convention',
] as const;

export type SageMemoryKind = (typeof SAGE_MEMORY_KINDS)[number];

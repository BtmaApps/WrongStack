// ── Public types ────────────────────────────────────────────────────────────

/**
 * Result of resolving the board that an `add` operation should target.
 *
 * `KanbanPanel` resolves the active board from the session tag
 * (`session:<sessionId>`) and falls back to the most-recently-updated board.
 * We mirror that exact precedence so a `/kanban add` issued while the panel
 * is open lands on the same board the user is looking at.
 */
export interface KanbanAddTarget {
  boardId: string;
  boardTitle: string;
  /** Column that the task will be placed in. Defaults to the first column. */
  columnId: string;
  /**
   * Whether the board enforces the managed Kanban Agent lifecycle. Managed
   * boards require new cards to be created in the Backlog column and with a
   * description, so callers route the user accordingly.
   */
  managed: boolean;
}

export interface KanbanSlashDeps {
  /**
   * Absolute project root used by the kanban file store. Must match the
   * value `KanbanPanel` reads from `agent.ctx.projectRoot` — using
   * `agent.ctx.cwd` would diverge when the user launches the TUI from a
   * subdirectory of the project.
   */
  projectRoot: string;
  /**
   * Session running the TUI. Used to prefer a `session:<id>`-tagged board, and
   * to attribute every board event `/kanban` writes.
   */
  sessionId: string;
  /**
   * Panel-open bridge installed by `App`. Calling `onPanelOpen.current(...)`
   * with `'toggleKanbanPanel'` opens the kanban panel — same mechanism the
   * other slash commands use. When absent, slash command returns text-only.
   */
  onPanelOpen?: { current: ((action: string) => boolean) | null } | undefined;
  /**
   * Optional hook that selects a specific board in the kanban panel. Used
   * by `/kanban use <boardId|title|tag>` and the Goal → Kanban bridge.
   * The callback receives a board id and returns true on success.
   */
  onBoardFocus?: { current: ((boardId: string) => boolean) | null } | undefined;
  /** Terminal width (cols) for help / boards table rendering. */
  terminalWidth?: number | undefined;
}

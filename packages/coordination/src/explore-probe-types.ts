/** Which observed work-state signal produced a probe. */
export type ExploreProbeSource =
  | 'edit_unread_file'
  | 'search_zero_hits'
  | 'unfamiliar_read'
  | 'todo_in_progress'
  | 'error_symbol'
  | 'mailbox_ask';

/** A narrow exploration task scoped to the leader's current work. */
export interface ExploreProbe {
  id: string;
  /** Human-readable question for the companion agent. */
  probe: string;
  /** Optional file/symbol hint so the companion starts index-first. */
  hint?: { file?: string; symbol?: string } | undefined;
  /** What the leader was doing when the trigger fired. */
  context?: string | undefined;
  source: ExploreProbeSource;
  /**
   * Dedupe key (`file:<path>`, `search:<query>`, `token:<symbol>`,
   * `todo:<id>`, `mail:<id>`). Probes with a subject probed within
   * `cooldownMs` are skipped.
   */
  subject: string;
  createdAt: number;
}

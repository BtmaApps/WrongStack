/**
 * DirectorBtwNotes — the leader agent's pending `/btw` note scratchpad.
 *
 * Extracted from `Director` (R4): a self-contained FIFO buffer (capped at 20)
 * the host uses to inject "by the way" nudges. The leader's agent loop consumes
 * pending notes at each iteration boundary and folds them into the conversation
 * as a visible block — no abort, no restart. Director keeps thin public
 * delegators (setLeaderBtwNote / getLeaderBtwNotes / peekLeaderBtwNotes /
 * drainLeaderBtwNotes) so its public surface is unchanged.
 */
export class DirectorBtwNotes {
  private notes: string[] = [];

  /** Stash a note (trimmed; empty ignored). Returns the pending count. Cap 20. */
  add(note: string): number {
    const trimmed = note.trim();
    if (!trimmed) return this.notes.length;
    this.notes = [...this.notes, trimmed].slice(-20);
    return this.notes.length;
  }

  /** Read and clear all pending notes, in FIFO order (empty array when none). */
  drain(): string[] {
    const notes = this.notes;
    this.notes = [];
    return notes;
  }

  /** Peek at pending notes without consuming them. */
  peek(): string[] {
    return [...this.notes];
  }
}

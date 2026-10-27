/** Preserve the order of saves for each session even if native IPC completes out of order. */
export class DraftWriter {
  private pending = new Map<string, Promise<void>>();
  constructor(private save: (id: string, text: string) => Promise<void>) {}
  write(id: string, text: string): Promise<void> {
    const previous = this.pending.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.save(id, text));
    this.pending.set(id, next);
    void next
      .finally(() => {
        if (this.pending.get(id) === next) this.pending.delete(id);
      })
      .catch(() => {});
    return next;
  }
}

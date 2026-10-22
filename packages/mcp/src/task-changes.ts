import { watch, type FSWatcher } from 'node:fs';

interface Listener {
  change: () => void;
  closed: () => void;
}

/** Atomic journal replacements are watched at the directory, never at the inode. */
export class MCPTaskChanges {
  private readonly listeners = new Set<Listener>();
  private watcher?: FSWatcher | undefined;
  private timer?: ReturnType<typeof setTimeout> | undefined;
  private resync?: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly directory: string) {}
  subscribe(change: () => void, closed: () => void): () => void {
    if (this.listeners.size >= 128) throw new Error('Too many MCP task subscriptions');
    const listener = { change, closed };
    this.listeners.add(listener);
    if (!this.resync) {
      this.startWatcher();
      this.resync = setInterval(() => {
        this.watcher?.close();
        this.watcher = undefined;
        this.startWatcher();
        this.invalidate();
      }, 30_000);
      this.resync.unref?.();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.stop();
    };
  }
  private startWatcher(): void {
    try {
      this.watcher = watch(this.directory, (_event, file) => {
        if (!file || String(file) === 'journal.json') this.invalidate();
      });
      this.watcher.unref();
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = undefined;
        this.invalidate();
      });
    } catch {
      /* A bounded resync still observes another process if watching fails. */
    }
  }
  invalidate(): void {
    if (!this.listeners.size || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      for (const listener of [...this.listeners]) {
        try {
          listener.change();
        } catch {
          /* Observers cannot break journal writers. */
        }
      }
    }, 50);
    this.timer.unref?.();
  }
  private stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.timer) clearTimeout(this.timer);
    if (this.resync) clearInterval(this.resync);
    this.timer = undefined;
    this.resync = undefined;
  }
  dispose(): void {
    const listeners = [...this.listeners];
    this.listeners.clear();
    this.stop();
    for (const listener of listeners) {
      try {
        listener.closed();
      } catch {
        /* Isolated observer. */
      }
    }
  }
}

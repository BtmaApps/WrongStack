import { DraftWriter } from './draft-storage';

export interface FileDraft {
  version: 1;
  path: string;
  content: string;
  saved: string;
}
export interface FileDraftSnapshot {
  revision: number;
  value: FileDraft | null;
}
export interface FileDraftStorage {
  get(key: string): Promise<FileDraftSnapshot>;
  save(key: string, value: FileDraft | null, revision: number): Promise<number>;
}
export async function fileDraftKey(path: string): Promise<string> {
  if (!path || path.startsWith('/') || path.split('/').some((part) => part === '..'))
    throw Error('Invalid project file path.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
  return `file-draft:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
/** Each window owns its revision; a stale window can never silently replace a peer's draft. */
export class FileDraftStore {
  private keys = new Map<string, Promise<string>>();
  private loaded = new Map<string, Promise<FileDraftSnapshot>>();
  private failures = new Map<string, unknown>();
  private writer: DraftWriter;
  constructor(private storage: FileDraftStorage) {
    this.writer = new DraftWriter(async (path, text, revision) => {
      try {
        const next = await storage.save(await this.key(path), JSON.parse(text), revision);
        this.failures.delete(path);
        return next;
      } catch (error) {
        this.failures.set(path, error);
        throw error;
      }
    });
  }
  private key(path: string): Promise<string> {
    let key = this.keys.get(path);
    if (!key) {
      key = fileDraftKey(path);
      this.keys.set(path, key);
    }
    return key;
  }
  load(path: string): Promise<FileDraftSnapshot> {
    let pending = this.loaded.get(path);
    if (!pending) {
      pending = this.key(path)
        .then((key) => this.storage.get(key))
        .then((snapshot) => {
          const value = snapshot.value;
          if (
            value &&
            (value.version !== 1 ||
              value.path !== path ||
              typeof value.content !== 'string' ||
              typeof value.saved !== 'string')
          )
            throw Error('This saved file draft cannot be read. It has been preserved.');
          this.writer.initialize(path, snapshot.revision);
          return snapshot;
        });
      this.loaded.set(path, pending);
      void pending.catch(() => this.loaded.delete(path));
    }
    return pending;
  }
  async write(path: string, content: string, saved: string): Promise<void> {
    await this.load(path);
    const value: FileDraft | null = content === saved ? null : { version: 1, path, content, saved };
    await this.writer.write(path, JSON.stringify(value));
  }
  async verify(path: string): Promise<void> {
    await this.load(path);
    await this.writer.drain(path);
    if (this.failures.has(path)) throw this.failures.get(path);
    const current = await this.storage.get(await this.key(path));
    if (current.revision !== this.writer.revision(path))
      throw Error(
        'DRAFT_CONFLICT: Another window changed this file draft. Compare the stored and local versions before continuing.',
      );
  }
  async inspect(path: string): Promise<FileDraftSnapshot> {
    await this.writer.drain(path);
    return this.storage.get(await this.key(path));
  }
  async resolve(path: string, revision: number, content: string, saved: string): Promise<void> {
    await this.writer.drain(path);
    this.writer.initialize(path, revision);
    await this.write(path, content, saved);
  }
  forget(path: string): void {
    this.loaded.delete(path);
    this.failures.delete(path);
  }
}

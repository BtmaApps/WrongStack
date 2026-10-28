import { emptyMailDraft, type MailDraft } from './mailbox-model';

/** Project-owned in-process draft; sends retain ownership across component replacement. */
export class MailboxDraftStore {
  private state = { draft: emptyMailDraft(), pending: false, error: '' };
  private listeners = new Set<() => void>();
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  update = (draft: MailDraft) => {
    if (!this.state.pending) this.publish({ draft, error: '' });
  };
  begin() {
    if (this.state.pending) throw Error('A mailbox send is already awaiting acknowledgement.');
    const submitted = this.state.draft;
    this.publish({ pending: true, error: '' });
    return submitted;
  }
  acknowledge(submitted: MailDraft) {
    this.publish({
      pending: false,
      ...(this.state.draft === submitted ? { draft: emptyMailDraft() } : {}),
    });
  }
  fail(error: unknown) {
    this.publish({
      pending: false,
      error: `${error instanceof Error ? error.message : String(error)} Check recent mailbox messages before retrying; delivery may already have been recorded.`,
    });
  }
}
const stores = new Map<string, MailboxDraftStore>();
export function mailboxDraftStore(projectId: string) {
  let store = stores.get(projectId);
  if (!store) {
    store = new MailboxDraftStore();
    stores.set(projectId, store);
  }
  return store;
}

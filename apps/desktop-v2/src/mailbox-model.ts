import { isMailboxMessageUnread, MAILBOX_MESSAGE_TYPES } from '@wrongstack/contracts/types/mailbox';
import { record } from './engine-values';

export const mailboxSendTypes = MAILBOX_MESSAGE_TYPES.filter((type) => type !== 'control');
export interface MailDraft {
  to: string;
  type: string;
  audience: string;
  priority: string;
  subject: string;
  body: string;
  replyTo: string;
}
export const emptyMailDraft = (): MailDraft => ({
  to: '',
  type: 'note',
  audience: 'all',
  priority: 'normal',
  subject: '',
  body: '',
  replyTo: '',
});
export const hasMailDraft = (draft: MailDraft) =>
  !!(draft.to || draft.subject || draft.body || draft.replyTo);
export const unreadMail = (mail: Record<string, unknown>) =>
  isMailboxMessageUnread({
    completed: mail['completed'] === true,
    readBy: record(mail['readBy']),
    ...(typeof mail['readByCount'] === 'number' ? { readByCount: mail['readByCount'] } : {}),
  });
const stamp = (mail: Record<string, unknown>) =>
  typeof mail['timestamp'] === 'number'
    ? mail['timestamp']
    : Date.parse(String(mail['timestamp'])) || 0;
export function mailboxThreads(messages: Record<string, unknown>[]) {
  const byId = new Map(messages.map((mail) => [String(mail['id']), mail]));
  const root = (mail: Record<string, unknown>): string => {
    const seen = new Set<string>();
    let id = String(mail['id']);
    while (true) {
      if (seen.has(id)) return [...seen].sort()[0]!;
      seen.add(id);
      const parent = byId.get(id)?.['replyTo'];
      if (typeof parent !== 'string' || !parent) return id;
      if (!byId.has(parent)) return parent;
      id = parent;
    }
  };
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const mail of messages) {
    const id = root(mail);
    const group = groups.get(id) ?? [];
    group.push(mail);
    groups.set(id, group);
  }
  return [...groups]
    .map(([id, values]) => {
      const items = values.sort((a, b) => stamp(a) - stamp(b));
      return {
        id,
        items,
        latest: items.at(-1)!,
        first: byId.get(id) ?? items[0]!,
        missingParent: !byId.has(id),
      };
    })
    .sort((a, b) => stamp(b.latest) - stamp(a.latest));
}
export function mailboxDuration(hours: string, label: string) {
  const value = Number(hours);
  if (
    !hours.trim() ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(value * 3600000)
  )
    throw Error(`${label} must be a non-negative number of hours.`);
  return value * 3600000;
}

import type { ChatEntry } from './session';

export type TranscriptRow =
  | { kind: 'message'; id: string; message: ChatEntry }
  | { kind: 'workspace'; id: string; notes: ChatEntry[] };

export function groupTranscript(messages: readonly ChatEntry[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  for (const message of messages) {
    if (message.role !== 'system') {
      rows.push({ kind: 'message', id: message.id, message });
      continue;
    }
    const previous = rows.at(-1);
    if (previous?.kind === 'workspace') previous.notes.push(message);
    else rows.push({ kind: 'workspace', id: message.id, notes: [message] });
  }
  return rows;
}

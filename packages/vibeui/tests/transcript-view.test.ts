import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../src/lib/session';
import { groupTranscript } from '../src/lib/transcript-view';

const entry = (id: string, role: ChatEntry['role']): ChatEntry => ({ id, role, text: id });

describe('workspace note grouping', () => {
  it('groups adjacent notes while preserving conversation boundaries and order', () => {
    const messages = [
      entry('a', 'system'),
      entry('b', 'system'),
      entry('c', 'user'),
      entry('d', 'assistant'),
      entry('e', 'system'),
      entry('f', 'thinking'),
      entry('g', 'system'),
    ];
    const rows = groupTranscript(messages);
    expect(rows.map((row) => [row.kind, row.id])).toEqual([
      ['workspace', 'a'],
      ['message', 'c'],
      ['message', 'd'],
      ['workspace', 'e'],
      ['message', 'f'],
      ['workspace', 'g'],
    ]);
    expect(rows[0]).toEqual({ kind: 'workspace', id: 'a', notes: messages.slice(0, 2) });
    expect(rows.flatMap((row) => (row.kind === 'workspace' ? row.notes : [row.message]))).toEqual(
      messages,
    );
  });
  it('keeps the group identity when a new note arrives and preserves runtime details', () => {
    const note = { ...entry('a', 'system'), runtimeContext: ['Session note', 'Tool coach'] };
    const messages = Object.freeze([Object.freeze(note)]);
    expect(groupTranscript(messages)[0]?.id).toBe(
      groupTranscript([...messages, entry('b', 'system')])[0]?.id,
    );
    expect(groupTranscript(messages)[0]).toEqual({ kind: 'workspace', id: 'a', notes: [note] });
    expect(messages).toHaveLength(1);
    expect(groupTranscript([])).toEqual([]);
  });
});

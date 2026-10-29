import { describe, expect, it } from 'vitest';
import { journalFileName, journalJsonl, journalMarkdown } from '../src/journal-export';

const rows = [
  {
    id: 'a',
    timestamp: '2026-10-29T08:00:00.000Z',
    category: 'refined_user',
    sessionId: 'sess_1',
    content: 'Refined: use ```ts blocks``` carefully\n# not a heading',
    rawContent: 'fix it',
    metadata: { provider: 'local', model: 'm1' },
  },
  { id: 'b', timestamp: '2026-10-29T09:00:00.000Z', category: 'raw_user', content: 'hello' },
];

describe('prompt journal export', () => {
  it('writes one unchanged entry per JSONL line', () => {
    const text = journalJsonl(rows);
    expect(
      text
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(rows);
    expect(journalJsonl([])).toBe('');
  });
  it('fences prompt text so its Markdown cannot change the document', () => {
    const md = journalMarkdown(rows, {
      title: 'Journal',
      filters: 'this session',
      exportedAt: '2026-10-29T10:00:00.000Z',
    });
    expect(md).toContain('2 entries · this session');
    expect(md).toContain('Session: `sess_1` · Model: `local/m1`');
    expect(md).toContain('### Original text\n\n```text\nfix it\n```');
    // The prompt contains a triple backtick, so its fence is longer.
    expect(md).toContain('````text\nRefined: use ```ts blocks``` carefully\n# not a heading\n````');
    expect(md).toContain('### Submitted text\n\n```text\nhello\n```');
  });
  it('builds a portable file name', () => {
    expect(journalFileName('session', '2026-10-29T10:00:00.000Z', 'md')).toBe(
      'wrongstack-prompt-journal-session-2026-10-29T10-00-00-000Z.md',
    );
  });
});

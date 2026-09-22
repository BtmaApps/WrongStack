import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ChatSearchBar } from '../src/components/chat-search-bar.js';
import type { HistoryEntry } from '../src/history-entry.js';

const entries: HistoryEntry[] = [
  { id: 1, kind: 'user', text: 'first mention of widget' },
  { id: 2, kind: 'assistant', text: 'second\nthe widget is \x1b[31mred\x1b[0m now' },
];

function frame(query: string, selectedEntryId: number | null, width = 80): string {
  const view = render(
    <ChatSearchBar
      search={{ query, selectedEntryId, jumpSeq: 0 }}
      entries={entries}
      includeReasoning
      width={width}
    />,
  );
  const out = view.lastFrame() ?? '';
  view.unmount();
  return out;
}

describe('ChatSearchBar', () => {
  it('shows position, total and the selected line without escape sequences', () => {
    const out = frame('widget', 2);
    expect(out).toContain('2/2');
    expect(out).toContain('the widget is red now');
    expect(out).not.toContain('\x1b[31m');
  });

  it('guides an empty query and reports a miss', () => {
    expect(frame('', null)).toContain('Type to search');
    expect(frame('gadget', null)).toContain('no matches');
  });

  it('keeps exactly two rows at a narrow width', () => {
    const lines = frame('widget', 2, 24).split('\n');
    expect(lines).toHaveLength(2);
  });
});

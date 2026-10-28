import type { Message } from '@wrongstack/contracts/types';
import { describe, expect, it } from 'vitest';
import {
  projectSessionTranscript,
  readSessionTranscriptBlock,
} from '../src/server/session-transcript';

describe('bounded retained session transcript', () => {
  it('searches beyond excerpts and excludes opaque media payloads and thinking signatures', () => {
    const text = 'x'.repeat(40000) + 'find-this-late-needle';
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text },
          {
            type: 'image',
            source: { type: 'base64', data: 'opaque-private-bytes', media_type: 'image/png' },
          },
          {
            type: 'document',
            name: 'notes.pdf',
            text: 'Extracted PDF text',
            source: { type: 'base64', media_type: 'application/pdf', data: 'opaque-pdf-bytes' },
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Recorded reasoning',
            signature: 'opaque-thinking-signature',
          },
        ],
      },
    ];
    const page = projectSessionTranscript(messages, { query: 'find-this-late-needle' });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.blocks[0]).toMatchObject({ textOffset: 39700 });
    expect(JSON.stringify(page)).toContain('find-this-late-needle');
    const all = JSON.stringify(projectSessionTranscript(messages, {}));
    expect(all).not.toContain('opaque-private-bytes');
    expect(all).not.toContain('opaque-pdf-bytes');
    expect(all).not.toContain('opaque-thinking-signature');
    expect(all).toContain('Extracted PDF text');
  });
  it('reads all long text in bounded Unicode-safe chunks and refuses stale text reads', () => {
    const text = 'a'.repeat(15999) + '😀' + 'b'.repeat(17000);
    const messages: Message[] = [{ role: 'assistant', content: text }];
    const page = projectSessionTranscript(messages, {});
    let offset = 0,
      recovered = '';
    do {
      const part = readSessionTranscriptBlock(messages, {
        expectedRevision: page.revision,
        messageIndex: 0,
        blockIndex: 0,
        offset,
      });
      expect(part.text.length).toBeLessThanOrEqual(16000);
      recovered += part.text;
      if (part.nextTextOffset === null) break;
      expect(part.nextTextOffset).toBeGreaterThan(offset);
      offset = part.nextTextOffset;
    } while (recovered.length < text.length);
    expect(recovered).toBe(text);
    expect(() =>
      readSessionTranscriptBlock([{ role: 'user', content: 'changed' }], {
        expectedRevision: page.revision,
        messageIndex: 0,
        blockIndex: 0,
      }),
    ).toThrow(/changed/);
  });
  it('applies role filters, stable paging and input bounds without changing messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Original' },
      { role: 'assistant', content: 'Answer' },
    ];
    expect(
      projectSessionTranscript(messages, { role: 'assistant' }).messages.map((item) => item.index),
    ).toEqual([1]);
    expect(projectSessionTranscript(messages, { limit: 1 }).nextOffset).toBe(1);
    expect(projectSessionTranscript(messages, { offset: 1, limit: 1 }).nextOffset).toBeNull();
    for (const options of [
      { limit: 0 },
      { limit: 1000 },
      { offset: -1 },
      { offset: 3 },
      { query: 'q'.repeat(501) },
      { role: 'invented' },
    ])
      expect(() => projectSessionTranscript(messages, options)).toThrow();
    expect(messages[0]?.content).toBe('Original');
  });
});

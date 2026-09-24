import { describe, expect, it } from 'vitest';
import { detectAtToken as detect, isFileSelectionCurrent } from '../src/hooks/use-file-search.js';

describe('file picker selection validity', () => {
  const original = { buffer: '@file', cursor: 5 };
  const token = detect(original.buffer, original.cursor);
  if (!token) throw new Error('fixture must contain an @token');

  it('accepts the unchanged @token selection', () => {
    expect(token).toEqual({ start: 0, end: 5, query: 'file' });
    expect(isFileSelectionCurrent(original, original, token)).toBe(true);
  });

  it('rejects a draft changed while an async attachment read is pending', () => {
    expect(
      isFileSelectionCurrent({ buffer: 'user changed the draft', cursor: 23 }, original, token),
    ).toBe(false);
  });

  it('rejects a cursor move even when the buffer text is unchanged', () => {
    expect(isFileSelectionCurrent({ buffer: original.buffer, cursor: 3 }, original, token)).toBe(
      false,
    );
  });
});

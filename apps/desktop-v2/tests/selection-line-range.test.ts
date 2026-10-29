import { describe, expect, it } from 'vitest';
import { selectionLineRange } from '../src/file-model';

describe('selection line range', () => {
  const text = 'one\ntwo\nthree\nfour';
  it('maps character offsets to inclusive lines', () => {
    expect(selectionLineRange(text, 0, 3)).toEqual([1, 1]);
    expect(selectionLineRange(text, 4, 13)).toEqual([2, 3]);
    expect(selectionLineRange(text, 13, 4)).toEqual([2, 3]);
    expect(selectionLineRange(text, 2, text.length)).toEqual([1, 4]);
  });
  it('does not count a line reached only by its leading newline', () => {
    expect(selectionLineRange(text, 0, 4)).toEqual([1, 1]);
    expect(selectionLineRange(text, 4, 8)).toEqual([2, 2]);
  });
  it('treats an empty selection as no range', () => {
    expect(selectionLineRange(text, 5, 5)).toBeNull();
    expect(selectionLineRange('', 0, 0)).toBeNull();
  });
});

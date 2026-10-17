import { describe, expect, it } from 'vitest';
import { clipInline } from '../../src/utils/tool-output-compact.js';

const hasLoneSurrogate = (s: string): boolean =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('clipInline', () => {
  it('returns short text collapsed and unchanged otherwise', () => {
    expect(clipInline('a \n  b')).toBe('a b');
  });

  it('truncates long ASCII with a length marker', () => {
    const out = clipInline('a'.repeat(500));
    expect(out).toBe(`${'a'.repeat(225)}...(500 chars)`);
  });

  it('never cuts an emoji in half at the truncation point', () => {
    // max 240 - 15 = 225 is odd, so the cut falls between the halves of a pair.
    for (const text of ['😀'.repeat(300), `a${'😀'.repeat(300)}`]) {
      const out = clipInline(text);
      expect(hasLoneSurrogate(out)).toBe(false);
      expect(out.endsWith(`...(${text.length} chars)`)).toBe(true);
    }
  });
});

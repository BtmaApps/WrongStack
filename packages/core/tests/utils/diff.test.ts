import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../src/utils/diff.js';

describe('unifiedDiff', () => {
  it('returns empty for identical inputs', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n')).toBe('');
  });

  it('produces header and hunk', () => {
    const d = unifiedDiff('a\nb\nc\n', 'a\nB\nc\n');
    expect(d).toContain('--- ');
    expect(d).toContain('+++ ');
    expect(d).toContain('@@');
    expect(d).toContain('-b');
    expect(d).toContain('+B');
  });

  it('handles total replacement', () => {
    const d = unifiedDiff('a\n', 'b\n');
    expect(d).toContain('-a');
    expect(d).toContain('+b');
  });

  it('handles addition only', () => {
    const d = unifiedDiff('a\n', 'a\nb\n');
    expect(d).toContain('+b');
  });

  it('handles deletion only', () => {
    const d = unifiedDiff('a\nb\n', 'a\n');
    expect(d).toContain('-b');
  });

  it('respects fromFile / toFile labels', () => {
    const d = unifiedDiff('x\n', 'y\n', { fromFile: 'foo.ts', toFile: 'foo.ts' });
    expect(d).toContain('--- foo.ts');
    expect(d).toContain('+++ foo.ts');
  });

  it('keeps full trailing context on a hunk that ends before a long equal run', () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
    const b = [...a];
    b[1] = 'X';
    b[15] = 'Y';
    const d = unifiedDiff(`${a.join('\n')}\n`, `${b.join('\n')}\n`);
    const hunks = d.split(/^@@.*@@$/m).slice(1);
    expect(d).toContain('@@ -1,5 +1,5 @@');
    expect(hunks[0]?.replace(/^\n|\n$/g, '').split('\n')).toEqual([
      ' l1',
      '-l2',
      '+X',
      ' l3',
      ' l4',
      ' l5',
    ]);
    expect(d).toContain('@@ -13,7 +13,7 @@');
  });

  it('normalizes CRLF and LF so equivalent line endings do not produce false diffs', () => {
    expect(unifiedDiff('a\r\nb\r\n', 'a\nb\n')).toBe('');
    const d = unifiedDiff('a\r\nb\r\n', 'a\r\nB\r\n');
    expect(d).toContain('-b');
    expect(d).toContain('+B');
  });
});

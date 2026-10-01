import { describe, expect, it } from 'vitest';
import { compileUserRegex } from '../src/regex-guard.js';

describe('regex verdict cache isolation', () => {
  for (const pattern of ['[', '(a+)+', '']) {
    it(`a returned failure cannot change the cached verdict for ${JSON.stringify(pattern)}`, () => {
      const first = compileUserRegex(pattern);
      expect(first.ok).toBe(false);
      Object.assign(first, { ok: true, reason: 'caller metadata mutation' });
      const next = compileUserRegex(pattern);
      expect(next.ok).toBe(false);
    });
  }

  for (const [flags, pattern, otherFlags, otherPattern] of [
    ['', '\0a', '\0', 'a'],
    ['i', 'a\0b', 'i\0a', 'b'],
  ] as const) {
    it(`does not collide valid patterns and invalid flags containing NUL (${JSON.stringify(flags)})`, () => {
      expect(compileUserRegex(pattern, flags).ok).toBe(true);
      expect(compileUserRegex(otherPattern, otherFlags).ok).toBe(false);
    });
  }
});

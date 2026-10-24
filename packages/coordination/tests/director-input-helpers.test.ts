import { describe, expect, it } from 'vitest';
import { stringArray } from '../src/director-input-helpers.js';

describe('stringArray', () => {
  it('trims usable strings and rejects empty or non-string entries', () => {
    expect(stringArray(['  alpha  ', '', 7, ' beta'])).toEqual(['alpha', 'beta']);
    expect(stringArray([' ', 7])).toBeUndefined();
  });
});

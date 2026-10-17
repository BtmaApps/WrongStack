import { describe, expect, it } from 'vitest';
import { patternIsLikelyCatastrophic } from '../../src/utils/json-schema-pattern-safety.js';

describe('patternIsLikelyCatastrophic nested groups', () => {
  it('flags a quantified atom hidden inside a nested group of an unbounded group', () => {
    expect(patternIsLikelyCatastrophic('^((a+)a)+$')).toBe(true);
    expect(patternIsLikelyCatastrophic('^(?:(?:a+)a)+$')).toBe(true);
  });

  it('flags an alternation hidden inside a nested group', () => {
    expect(patternIsLikelyCatastrophic('^((a|aa)b?)+$')).toBe(true);
  });

  it('keeps flat and separator-disambiguated patterns as before', () => {
    expect(patternIsLikelyCatastrophic('^(a+a)+$')).toBe(true);
    expect(patternIsLikelyCatastrophic('^[a-z0-9]+(?:-[a-z0-9]+)*$')).toBe(false);
    expect(patternIsLikelyCatastrophic('^(?:(?:-[a-z]+))+$')).toBe(false);
  });

  it('does not treat an optional atom as a mandatory separator', () => {
    expect(patternIsLikelyCatastrophic('^(a+b?)+$')).toBe(true);
    expect(patternIsLikelyCatastrophic('^(\\w+\\s?)+$')).toBe(true);
    expect(patternIsLikelyCatastrophic('^(?:a+b)+$')).toBe(false);
  });

  it('does not read a named-group name or lookbehind marker as a separator', () => {
    expect(patternIsLikelyCatastrophic('^(?<s>[a-z]+)+$')).toBe(true);
    expect(patternIsLikelyCatastrophic('^(?<=x)(?:[a-z]+)+$')).toBe(true);
    expect(patternIsLikelyCatastrophic('^(?<w>-[a-z]+)+$')).toBe(false);
  });
});

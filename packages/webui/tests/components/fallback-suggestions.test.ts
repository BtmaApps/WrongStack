import { describe, expect, it } from 'vitest';
import {
  findProfileWithChain,
  formatContextWindow,
  formatPricePair,
  suggestionProfileName,
} from '../../src/components/SettingsPanel/fallback-suggestions';

describe('fallback suggestion helpers', () => {
  it('names an accepted suggestion after its archetype without overwriting a profile', () => {
    expect(suggestionProfileName('strong', {})).toBe('strong');
    expect(suggestionProfileName('strong', { strong: ['a/b'] })).toBe('strong-2');
    expect(suggestionProfileName('fast', { fast: [], 'fast-2': [] })).toBe('fast-3');
  });

  it('recognises a suggestion that is already saved, order included', () => {
    const profiles = { mine: ['zai/glm-5.3', 'opencode/claude-opus-5-5'] };
    expect(findProfileWithChain(['zai/glm-5.3', 'opencode/claude-opus-5-5'], profiles)).toBe(
      'mine',
    );
    expect(
      findProfileWithChain(['opencode/claude-opus-5-5', 'zai/glm-5.3'], profiles),
    ).toBeUndefined();
  });

  it('formats catalog price and context compactly', () => {
    expect(formatPricePair(0.3, 1.2)).toBe('$0.30 / $1.2');
    expect(formatPricePair(15, 75)).toBe('$15 / $75');
    expect(formatPricePair(0, 0)).toBe('free');
    expect(formatPricePair(undefined, undefined)).toBe('');
    expect(formatContextWindow(200_000)).toBe('200K');
    expect(formatContextWindow(1_048_576)).toBe('1M');
    expect(formatContextWindow(undefined)).toBe('');
  });
});

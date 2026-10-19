import { describe, expect, it } from 'vitest';
import { buildPromptPickerPayload } from '../src/hooks/use-prompt-picker.js';

describe('buildPromptPickerPayload', () => {
  it('keeps all original prompt variants available to the picker', () => {
    const variants = {
      simple: 'Short style',
      detailed: 'Detailed style',
      advanced: 'Advanced style',
    };
    const payload = buildPromptPickerPayload(
      [
        {
          slug: 'style',
          title: 'Style',
          description: '',
          category: 'design',
          source: 'builtin',
          content: variants.detailed,
          favorite: false,
          variants,
        },
      ],
      [],
    );
    expect(payload.all[0]?.variants).toEqual(variants);
  });
  it('maps prompt entries and builds recent/favorites/category sections', () => {
    const payload = buildPromptPickerPayload(
      [
        {
          slug: 'alpha',
          title: 'Alpha Prompt',
          description: 'First prompt',
          category: 'General',
          source: 'project',
          content: 'Alpha body',
          favorite: true,
        },
        {
          slug: 'beta',
          title: 'Beta Prompt',
          description: 'Second prompt',
          category: 'Review',
          source: 'user',
          content: 'Beta body',
          favorite: false,
        },
      ],
      ['beta'],
    );

    expect(payload.all).toHaveLength(2);
    expect(payload.all.map((entry) => entry.slug)).toEqual(['alpha', 'beta']);
    expect(payload.recentSlugs).toEqual(['beta']);
    expect(payload.categories).toEqual(['all', '🕘 recent', '★ favorites', 'General', 'Review']);
  });

  it('omits recent and favorites sections when not needed', () => {
    const payload = buildPromptPickerPayload(
      [
        {
          slug: 'gamma',
          title: 'Gamma Prompt',
          description: 'Third prompt',
          category: 'General',
          source: 'project',
          content: 'Gamma body',
          favorite: false,
        },
        {
          slug: 'beta',
          title: 'Beta Prompt',
          description: 'Second prompt',
          category: 'Review',
          source: 'user',
          content: 'Beta body',
          favorite: false,
        },
      ],
      [],
    );

    expect(payload.categories).toEqual(['all', 'General', 'Review']);
  });

  it('preserves duplicate-category entries while deduplicating category labels', () => {
    const payload = buildPromptPickerPayload(
      [
        {
          slug: 'one',
          title: 'One',
          description: 'Desc one',
          category: 'General',
          source: 'project',
          content: 'One body',
          favorite: false,
        },
        {
          slug: 'two',
          title: 'Two',
          description: 'Desc two',
          category: 'General',
          source: 'project',
          content: 'Two body',
          favorite: false,
        },
      ],
      [],
    );

    expect(payload.all).toHaveLength(2);
    expect(payload.categories).toEqual(['all', 'General']);
  });
});

import { describe, expect, it } from 'vitest';
import { designEditCodec, designEditEmpty } from '../src/design-edit-draft';

describe('design edit drafts', () => {
  it('round-trips colors, baseline and tuning for one kit', () => {
    const draft = {
      kit: 'aurora',
      colors: { 'light.accent': 'oklch(0.6 0.2 250)' },
      baseline: { 'light.accent': '#111111' },
      tune: { radius: '6px', font: '' },
    };
    expect(
      designEditCodec.parse(JSON.parse(JSON.stringify(designEditCodec.serialize(draft)))),
    ).toEqual(draft);
    expect(designEditCodec.parse(null)).toBeNull();
  });

  it('refuses unsupported or hostile envelopes', () => {
    const valid = { version: 1, kit: 'aurora', colors: {}, baseline: null, tune: {} };
    for (const broken of [
      { ...valid, version: 2 },
      { ...valid, kit: '' },
      { ...valid, colors: { accent: 7 } },
      { ...valid, tune: [] },
      { ...valid, baseline: 'x' },
      { ...valid, colors: JSON.parse('{"__proto__":"#fff"}') },
      { ...valid, colors: { accent: 'x'.repeat(4097) } },
    ])
      expect(() => designEditCodec.parse(broken)).toThrow(/unsupported format/);
  });

  it('treats blank tuning without colors as nothing to keep', () => {
    expect(designEditEmpty({ colors: {}, baseline: null, tune: { radius: '  ' } })).toBe(true);
    expect(designEditEmpty({ colors: {}, baseline: null, tune: { radius: '4px' } })).toBe(false);
    expect(designEditEmpty({ colors: { accent: '#fff' }, baseline: {}, tune: {} })).toBe(false);
  });
});

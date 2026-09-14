import { describe, expect, it } from 'vitest';
import { fontScalePostcssPlugin, scaleTypographyValue } from '@/lib/font-scale-css';

describe('scaleTypographyValue', () => {
  it('scales absolute font sizes and Tailwind text tokens', () => {
    expect(scaleTypographyValue('font-size', '11px')).toBe('calc(11px * var(--ui-font-scale, 1))');
    expect(scaleTypographyValue('font-size', '0.75rem')).toBe(
      'calc(0.75rem * var(--ui-font-scale, 1))',
    );
    expect(scaleTypographyValue('font-size', '8.5px')).toBe(
      'calc(8.5px * var(--ui-font-scale, 1))',
    );
    expect(scaleTypographyValue('font-size', 'var(--text-xs)')).toBe(
      'calc(var(--text-xs) * var(--ui-font-scale, 1))',
    );
  });

  it('scales absolute line heights only', () => {
    expect(scaleTypographyValue('line-height', '16px')).toBe(
      'calc(16px * var(--ui-font-scale, 1))',
    );
    expect(scaleTypographyValue('line-height', '1.5')).toBeNull();
    expect(
      scaleTypographyValue('line-height', 'var(--tw-leading, var(--text-xs--line-height))'),
    ).toBeNull();
  });

  it('leaves relative, keyword, zero, and already-scaled values alone', () => {
    for (const value of ['85%', '1.2em', 'inherit', '0', 'calc(1em + 2px)', 'larger']) {
      expect(scaleTypographyValue('font-size', value), value).toBeNull();
    }
    expect(scaleTypographyValue('font-size', 'calc(11px * var(--ui-font-scale, 1))')).toBeNull();
  });
});

describe('fontScalePostcssPlugin', () => {
  const decl = (prop: string, value: string, file?: string) => ({
    prop,
    value,
    source: { input: { file } },
  });

  it('rewrites project declarations and skips node_modules', () => {
    const plugin = fontScalePostcssPlugin();
    const own = decl('font-size', '12px', 'D:/repo/packages/webui/src/index.css');
    const vendor = decl('font-size', '12px', 'D:\\repo\\node_modules\\monaco-editor\\x.css');
    const other = decl('margin', '12px', 'D:/repo/packages/webui/src/index.css');
    plugin.Declaration(own);
    plugin.Declaration(vendor);
    plugin.Declaration(other);
    expect(own.value).toBe('calc(12px * var(--ui-font-scale, 1))');
    expect(vendor.value).toBe('12px');
    expect(other.value).toBe('12px');
  });
});

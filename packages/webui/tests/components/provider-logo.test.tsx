import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProviderLogo } from '../../src/components/ProviderLogo';
import { resolveProviderBrand } from '../../src/lib/provider-brand';

describe('provider identity in key-entry screens', () => {
  it('recognizes generated subscription profile ids and branded endpoints behind personal aliases', () => {
    expect(resolveProviderBrand('zai-coding-plan-3')?.id).toBe('zai');
    expect(resolveProviderBrand('work', 'https://api.deepseek.com/v1')?.id).toBe('deepseek');
    expect(resolveProviderBrand('work', undefined, 'openai-codex')?.id).toBe('openai');
  });

  it('does not mistake API compatibility, lookalike hosts or arbitrary ids for a brand', () => {
    expect(resolveProviderBrand('openai-compatible')).toBeNull();
    expect(resolveProviderBrand('work', 'https://custom.example/v1', 'openai')).toBeNull();
    expect(resolveProviderBrand('custom', 'https://api.openai.com.attacker.example/v1')).toBeNull();
    expect(resolveProviderBrand('constructor', 'not a URL')).toBeNull();
  });

  it('uses the actual known endpoint when a saved alias suggests another vendor', () => {
    expect(resolveProviderBrand('openai', 'https://api.groq.com/openai/v1')?.id).toBe('groq');
  });

  it('falls back when a local asset fails and loads the new mark after a provider switch', () => {
    const { container, rerender } = render(<ProviderLogo providerId="openai" />);
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/provider-logos/openai.svg');
    fireEvent.error(image!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<ProviderLogo providerId="deepseek" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/provider-logos/deepseek-color.svg',
    );
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SearchHighlight } from '../src/components/search-highlight';

const render = (value: string, query: string) =>
  renderToStaticMarkup(createElement(SearchHighlight, { value, query }));
describe('literal search highlights', () => {
  it('treats regex syntax as ordinary search text', () => {
    expect(render('Read [x] before x.', '[x]')).toBe(
      'Read <mark class="search-hit">[x]</mark> before x.',
    );
    expect(render('a.b and axb', '.')).toBe('a<mark class="search-hit">.</mark>b and axb');
  });
  it('highlights repeated words case-insensitively and preserves the text', () => {
    const result = render('Cache input and cache output', 'cache output');
    expect(result).toContain('<mark class="search-hit">Cache</mark>');
    expect(result).toContain('<mark class="search-hit">cache</mark>');
    expect(result).toContain('<mark class="search-hit">output</mark>');
  });
  it('keeps empty and missing queries readable and escapes markup', () => {
    expect(render('hello', '  ')).toBe('hello');
    expect(render('hello', 'missing')).toBe('hello');
    expect(render('<script>', 'script')).not.toContain('<script>');
  });
});

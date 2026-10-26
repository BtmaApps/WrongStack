import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '../src/MarkdownContent';
import { markdownTarget } from '../src/markdown-target';

const render = (text: string) => renderToStaticMarkup(createElement(MarkdownContent, { text }));
describe('desktop-owned Markdown rendering', () => {
  it('renders streamed fences, lists, tables, inline code, and raw-text copy controls', () => {
    const html = render(
      '## Result\n\n- **Ready** with `Bun`\n\n| Test | State |\n| --- | --- |\n| Native | Pass |\n\n```ts\nconst native = true;\n',
    );
    expect(html).toContain('<h2>Result</h2>');
    expect(html).toContain('<strong>Ready</strong>');
    expect(html).toContain('<table>');
    expect(html).toContain('const native = true;');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('language-ts');
  });
  it('does not execute HTML or load remote images or unsafe link schemes', () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)" />\n\n[bad](javascript:alert(1))\n\n![diagram](https://example.invalid/diagram.png)',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('onerror=');
    expect(html).toContain('Open image');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///C:/private',
    '//example.com',
    '../secret',
    '%2e%2e/private',
    'C:\\secret',
    'docs/%00secret',
    'https://name:secret@example.com',
  ])('refuses privileged or ambiguous navigation: %s', (url) => {
    expect(markdownTarget(url)).toBeNull();
  });
  it('routes ordinary project links through the engine and HTTP links through the OS boundary', () => {
    expect(markdownTarget('docs/native%20chat.md#L12')).toEqual({
      kind: 'file',
      value: 'docs/native chat.md',
    });
    expect(markdownTarget('https://example.com/docs')).toEqual({
      kind: 'external',
      value: 'https://example.com/docs',
    });
  });
});

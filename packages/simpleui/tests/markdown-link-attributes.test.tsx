/**
 * The markdown link override spread every prop onto `<a>`, including
 * react-markdown's hast `node`, so each link carried `node="[object Object]"`.
 * Unsafe schemes are blanked by react-markdown before the override runs; this
 * pins that too, since the override passes `href` through untouched.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { markdownComponents } from '../src/lib/markdown-config.js';

const render = (md: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { components: markdownComponents }, md));

describe('simpleui markdown links', () => {
  it('renders only DOM attributes on a link', () => {
    const html = render('[docs](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('node=');
  });

  it('keeps script-capable schemes out of href', () => {
    for (const md of ['[a](javascript:alert(1))', '[b](data:text/html,x)', '[c](vbscript:x)']) {
      expect(render(md)).toContain('href=""');
    }
  });
});

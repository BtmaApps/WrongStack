// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodePanel } from '../src/components/code-panel';
import { ContentView } from '../src/components/content-view';
import { MarkdownContent } from '../src/components/markdown-content';

function documentFor(element: Parameters<typeof renderToStaticMarkup>[0]) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = renderToStaticMarkup(element);
  return doc;
}

describe('readable code and JSON', () => {
  it('formats compact JSON without changing large numbers, duplicate keys or string contents', () => {
    const value = '{"id":9007199254740993,"id":1e40,"text":"a  b\\n<script>","ok":true}';
    const doc = documentFor(createElement(CodePanel, { value }));
    expect(doc.querySelector('pre')?.textContent).toBe(
      '{\n  "id": 9007199254740993,\n  "id": 1e40,\n  "text": "a  b\\n<script>",\n  "ok": true\n}',
    );
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelector('code span')).not.toBeNull();
  });

  it.each(['{"pending":', 'Tool finished.\n  exit: 0', '', 'null'])(
    'keeps incomplete JSON and ordinary output unchanged: %s',
    (value) => {
      const doc = documentFor(createElement(CodePanel, { value }));
      expect(doc.querySelector('pre')?.textContent).toBe(value);
    },
  );

  it('highlights fenced code and keeps HTML source inert', () => {
    const doc = documentFor(
      createElement(MarkdownContent, {
        text: '```javascript\nconst ready = true;\n```\n\n```html\n<script>alert(1)</script>\n```',
      }),
    );
    expect(doc.querySelector('code')?.textContent).toBe('const ready = true;\n');
    expect(doc.querySelectorAll('code span').length).toBeGreaterThan(0);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('code')[1]?.textContent).toBe('<script>alert(1)</script>\n');
  });

  it('renders bare JSON as a collapsible structure while keeping Markdown links readable', () => {
    const doc = documentFor(
      createElement(MarkdownContent, {
        text: '{"items":[{"name":"first"}],"count":9007199254740993,"empty":null}',
      }),
    );
    expect(doc.querySelector('details[open]')).not.toBeNull();
    expect(doc.querySelector('summary')?.textContent).toContain('3 fields');
    expect(doc.body.textContent).toContain('9007199254740993');
    expect(doc.querySelectorAll('details')).toHaveLength(2);
    const prose = documentFor(
      createElement(MarkdownContent, { text: '[Guide](https://example.com)' }),
    );
    expect(prose.querySelector('a')?.textContent).toBe('Guide');
  });

  it('keeps unknown languages and very large code blocks fully readable', () => {
    const value = `${'x'.repeat(100_001)}\nlast line\n`;
    const doc = documentFor(createElement(CodePanel, { value, language: 'unknown-language' }));
    expect(doc.querySelector('code')?.textContent).toBe(value);
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'treats unsupported language %s as text',
    (language) => {
      const doc = documentFor(createElement(CodePanel, { value: '<tag>hello</tag>', language }));
      expect(doc.querySelector('code')?.textContent).toBe('<tag>hello</tag>');
      expect(doc.querySelector('tag')).toBeNull();
    },
  );

  it('prioritizes JSON over Markdown characters inside string values', () => {
    const doc = documentFor(
      createElement(ContentView, { value: '{"message":"**hello**","items":[]}' }),
    );
    expect(doc.querySelector('details')).not.toBeNull();
    expect(doc.querySelector('strong')).toBeNull();
    expect(doc.body.textContent).toContain('"**hello**"');
  });

  it('renders Markdown tool output, including tables and highlighted code', () => {
    const doc = documentFor(
      createElement(ContentView, {
        value: '# Result\n\n| State |\n| --- |\n| Ready |\n\n```ts\nconst ready = true;\n```',
      }),
    );
    expect(doc.querySelector('h1')?.textContent).toBe('Result');
    expect(doc.querySelector('td')?.textContent).toBe('Ready');
    expect(doc.querySelector('code')?.textContent).toBe('const ready = true;\n');
    expect(doc.querySelector('code span')).not.toBeNull();
  });

  it.each([
    `[${'['.repeat(65)}0${']'.repeat(65)}]`,
    JSON.stringify({ text: 'x'.repeat(200_001), last: 'last field' }),
  ])('falls back to complete source for JSON beyond the interactive budget', (value) => {
    const doc = documentFor(createElement(CodePanel, { value, defaultView: 'tree' }));
    expect(doc.querySelector('code')?.textContent).toBe(value);
  });

  it('keeps file comparisons byte-for-byte when formatting is disabled', () => {
    const value = '{"a": 1,   "b":2}\n';
    const doc = documentFor(
      createElement(CodePanel, { value, language: 'file.json', formatJson: false }),
    );
    expect(doc.querySelector('code')?.textContent).toBe(value);
  });
});

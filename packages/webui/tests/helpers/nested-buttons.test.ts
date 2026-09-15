import { describe, expect, it } from 'vitest';
import { nestedButtons } from './nested-buttons.js';

/**
 * The tree is built with `createElement`/`appendChild`, never `innerHTML`: the
 * HTML parser auto-closes an open `<button>` when it meets another `<button>`
 * start tag (a deliberate spec rule), so an `innerHTML` fixture for this shape
 * silently produces *siblings* and the test would pass against a detector that
 * does nothing. `appendChild` bypasses the parser and keeps the invalid shape.
 */
function el(tag: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function tree(outer: HTMLElement, ...children: HTMLElement[]): HTMLElement {
  const root = el('div');
  for (const child of children) outer.appendChild(child);
  root.appendChild(outer);
  return root;
}

describe('nestedButtons', () => {
  it('reports the outer button of a nested pair, by its text', () => {
    expect(nestedButtons(tree(el('button', 'outer'), el('button', 'inner')))).toEqual([
      'outerinner',
    ]);
  });

  it('reports nesting through intermediate wrappers', () => {
    const wrapper = el('div');
    wrapper.appendChild(el('button', 'deep'));
    const outer = el('button');
    outer.appendChild(el('span', 'x'));
    expect(nestedButtons(tree(outer, wrapper))).toEqual(['xdeep']);
  });

  it('names an outer button that has no text of its own', () => {
    // Icon-only headers are the common case in this codebase, so the failure
    // message must still point at something identifiable.
    expect(nestedButtons(tree(el('button'), el('button', 'icon')))).toEqual(['icon']);
  });

  it('returns an empty list for sibling buttons and for an empty tree', () => {
    const siblings = el('div');
    siblings.appendChild(el('button', 'a'));
    siblings.appendChild(el('button', 'b'));
    expect(nestedButtons(siblings)).toEqual([]);

    expect(nestedButtons(el('div'))).toEqual([]);
  });
});

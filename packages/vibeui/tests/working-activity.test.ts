// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkingActivity } from '../src/components/working-activity';
import type { ToolEntry } from '../src/lib/session';

const tool = (id: string, status: ToolEntry['status']): ToolEntry => ({
  id,
  name: `tool_${id}`,
  status,
  input: { secret: 'hidden arguments' },
  output: 'hidden result',
});
function render(tools: ToolEntry[]) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = renderToStaticMarkup(
    createElement(WorkingActivity, {
      tools,
      onInspect: () => {},
      onViewActivity: () => {},
    }),
  );
  return doc;
}

describe('compact running activity', () => {
  it('shows only the last three calls, newest first, without arguments or results', () => {
    const doc = render([
      tool('old', 'done'),
      tool('a', 'done'),
      tool('b', 'error'),
      tool('c', 'running'),
    ]);
    const list = doc.querySelector('ul');
    expect(list?.querySelectorAll('li')).toHaveLength(3);
    expect(
      Array.from(list?.querySelectorAll('button') ?? []).map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Inspect tool_c · Running',
      'Inspect tool_b · Failed',
      'Inspect tool_a · Completed',
    ]);
    expect(doc.body.textContent).not.toContain('tool_old');
    expect(doc.body.textContent).not.toContain('hidden arguments');
    expect(doc.body.textContent).not.toContain('hidden result');
    expect(doc.body.textContent).toContain('tool_c is running');
  });

  it('shows a quiet working indicator before tools arrive', () => {
    const doc = render([]);
    expect(doc.body.textContent).toContain('Working on it');
    expect(doc.body.textContent).toContain('View activity');
    expect(doc.querySelector('ul')).toBeNull();
  });

  it('keeps completed and interrupted calls visible while the model continues working', () => {
    const doc = render([tool('a', 'done'), tool('b', 'interrupted')]);
    expect(doc.querySelector('[role="status"]')?.textContent).toContain('Working on it');
    expect(doc.querySelectorAll('li')).toHaveLength(2);
    expect(doc.body.textContent).toContain('Interrupted');
  });
});

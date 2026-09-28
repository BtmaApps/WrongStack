import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderInstructionLayer } from '../../src/core/instruction-template.js';

const text = readFileSync(
  new URL('../../instructions/shared/system/availability.md', import.meta.url),
  'utf8',
);
function render(names: string[]) {
  return renderInstructionLayer(text, {
    toolNames: new Set(names),
    tier: 'minimal',
    subagent: false,
    strictToolReferences: true,
  });
}
describe('Project Kit model guidance', () => {
  it('preserves reuse guidance when execution is deferred', () => {
    const output = render(['project_kit', 'tool_search', 'tool_use']);
    expect(output).toContain('Before writing an ad hoc script');
    expect(output).toContain('Discover the Project Kit execution tool');
    expect(output).not.toContain('`project_kit_run`');
  });
  it('names the executor only when available and removes kit guidance when disabled', () => {
    expect(render(['project_kit', 'project_kit_run'])).toContain('Use `project_kit_run`');
    expect(render([])).not.toContain('Project Kit');
    expect(render([])).not.toContain('`project_kit`');
  });
});

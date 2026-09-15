import { validateAgainstSchema } from '@wrongstack/core/utils';
import { describe, expect, it, vi } from 'vitest';
import { createRenameTool } from '../../src/tools/rename.js';

/**
 * typescript-language-server applied `new_name: "bad name"` to every
 * reference and wrote the broken code into two files (audit 2026-09-15). The
 * edit is applied immediately, so the name must be refused before the server
 * is asked.
 */
function makeTool() {
  const findForPath = vi.fn();
  const tool = createRenameTool({
    registry: { findForPath } as never,
    tracker: {} as never,
    cfg: {} as never,
    log: {} as never,
  });
  return { tool, findForPath };
}

describe('lsp_rename new_name validation', () => {
  it('schema rejects empty and whitespace-bearing names', () => {
    const { tool } = makeTool();
    const base = { path: 'a.ts', line: 1, character: 1 };
    expect(validateAgainstSchema({ ...base, new_name: 'greetUser' }, tool.inputSchema).ok).toBe(
      true,
    );
    for (const bad of ['', 'bad name', ' lead', 'tab\tname', 'line\nbreak']) {
      expect(validateAgainstSchema({ ...base, new_name: bad }, tool.inputSchema).ok).toBe(false);
    }
    expect(validateAgainstSchema({ ...base, line: 0, new_name: 'x' }, tool.inputSchema).ok).toBe(
      false,
    );
  });

  it('execute refuses an invalid name without contacting the server', async () => {
    const { tool, findForPath } = makeTool();
    await expect(
      tool.execute(
        { path: 'a.ts', line: 1, character: 1, new_name: 'bad name' },
        {
          cwd: '.',
        } as never,
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/new_name must be a non-empty identifier/);
    expect(findForPath).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import { applyAsciiMode } from '../src/boot/ascii-mode.js';

describe('--ascii', () => {
  it('is a boolean flag that does not swallow the task', () => {
    const { flags, positional } = parseArgs(['--ascii', 'fix the bug']);
    expect(flags['ascii']).toBe(true);
    expect(positional).toEqual(['fix the bug']);
  });

  it('selects the ASCII icon style for the TUI and child processes', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(applyAsciiMode({}, env, [])).toBe(false);
    expect(env['WRONGSTACK_TUI_ICON_STYLE']).toBeUndefined();
    expect(applyAsciiMode({ ascii: true }, env, [])).toBe(true);
    expect(env['WRONGSTACK_TUI_ICON_STYLE']).toBe('ascii');
  });
});

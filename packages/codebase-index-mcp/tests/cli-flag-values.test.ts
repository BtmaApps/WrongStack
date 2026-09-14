import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('Codebase Index MCP CLI — flag values', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not resolve a value-less --project-root to the cwd', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--project-root'], {}).projectRoot).toBe('');
    expect(warn).toHaveBeenCalled();
  });

  it('does not swallow the next flag as a value', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseArgs(['--project-root', '--writable'], {});
    expect(parsed.projectRoot).toBe('');
    expect(parsed.writable).toBe(true);
  });

  it('rejects an out-of-range port and warns on unknown options', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseArgs(['--project-root', '.', '--port', '70000', '--writeable'], {});
    expect(parsed.httpPort).toBe(0);
    expect(parsed.writable).toBe(false);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(
      /not a valid port[\s\S]*unknown option --writeable/,
    );
  });
});

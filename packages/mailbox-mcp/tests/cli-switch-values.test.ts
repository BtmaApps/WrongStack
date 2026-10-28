/**
 * `parseArgs` splits `--flag=value`, but the switch cases ignored the value:
 * `--writable=false` granted the tier it was written to deny.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/main.js';

vi.spyOn(console, 'warn').mockImplementation(() => undefined);
const parse = (argv: string[]) =>
  parseArgs(argv, {} as never) as unknown as Record<string, unknown>;

describe('mailbox-mcp: privilege switches with an inline value', () => {
  it('true / 1 grant; false / 0 / anything else deny', () => {
    expect(parse(['--writable']).writable).toBe(true);
    expect(parse(['--writable=true']).writable).toBe(true);
    expect(parse(['--writable=1']).writable).toBe(true);
    expect(parse(['--writable=false']).writable).toBe(false);
    expect(parse(['--writable=0']).writable).toBe(false);
    expect(parse(['--writable=yes-please']).writable).toBe(false);
  });

  it('--admin=false grants neither admin nor writable', () => {
    expect(parse(['--admin=false'])).toMatchObject({ admin: false, writable: false });
    expect(parse(['--admin'])).toMatchObject({ admin: true, writable: true });
  });
});

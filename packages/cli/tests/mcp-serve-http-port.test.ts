import { describe, expect, it } from 'vitest';
import { resolveServeHttpPort } from '../src/mcp-serve.js';

/**
 * `--http` doubles as a boolean flag. `Number(flags.port ?? flags.http)` turned
 * a bare `--http` into `Number(true) === 1`, so `wstack mcp serve --http` tried
 * to bind privileged port 1 instead of an ephemeral port.
 */
describe('resolveServeHttpPort', () => {
  it('uses an ephemeral port for a bare --http', () => {
    expect(resolveServeHttpPort({ http: true })).toBe(0);
    expect(resolveServeHttpPort({})).toBe(0);
  });

  it('accepts --port and the --http=<port> form', () => {
    expect(resolveServeHttpPort({ http: true, port: '8765' })).toBe(8765);
    expect(resolveServeHttpPort({ http: '9000' })).toBe(9000);
  });

  it('rejects out-of-range or non-integer ports', () => {
    expect(() => resolveServeHttpPort({ port: '70000' })).toThrow(/invalid --port/);
    expect(() => resolveServeHttpPort({ port: 'abc' })).toThrow(/invalid --port/);
    expect(() => resolveServeHttpPort({ port: '80.5' })).toThrow(/invalid --port/);
  });
});

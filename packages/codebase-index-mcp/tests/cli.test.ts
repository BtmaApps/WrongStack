import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('Codebase Index MCP CLI arguments', () => {
  it('defaults to read-only stdio', () => {
    expect(parseArgs(['--project-root', '.'])).toMatchObject({
      transport: 'stdio',
      writable: false,
      watch: false,
      httpHost: '127.0.0.1',
      httpPort: 0,
    });
  });

  it('parses HTTP, authentication, index directory, and writable options', () => {
    expect(
      parseArgs([
        '--project-root',
        '.',
        '--index-dir',
        '.index-test',
        '--http',
        '--host',
        '0.0.0.0',
        '--port',
        '8767',
        '--token',
        'secret',
        '--writable',
      ]),
    ).toMatchObject({
      transport: 'http',
      httpHost: '0.0.0.0',
      httpPort: 8767,
      httpToken: 'secret',
      writable: true,
    });
  });

  it('keeps a token that starts with a dash and never echoes it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = '-Qx7_secretTok3n';
    expect(
      parseArgs(['--project-root', '.', '--http', '--token', token, '--writable'], {}),
    ).toMatchObject({ httpToken: token, writable: true });
    expect(warn.mock.calls.flat().join(' ')).not.toContain(token);
    warn.mockRestore();
  });

  it('parses --watch independently of --writable', () => {
    expect(parseArgs(['--project-root', '.', '--watch'])).toMatchObject({
      watch: true,
      writable: false,
    });
  });
});

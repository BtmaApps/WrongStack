import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('Kanban MCP CLI arguments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('defaults to read-only stdio', () => {
    expect(parseArgs(['--project-root', '.'])).toMatchObject({
      transport: 'stdio',
      writable: false,
      destructive: false,
      httpHost: '127.0.0.1',
      httpPort: 0,
    });
  });

  it('parses HTTP, authentication, actor, and writable options', () => {
    expect(
      parseArgs([
        '--project-root',
        '.',
        '--http',
        '--host',
        '0.0.0.0',
        '--port',
        '8766',
        '--token',
        'secret',
        '--actor',
        'codex-agent',
        '--writable',
      ]),
    ).toMatchObject({
      transport: 'http',
      httpHost: '0.0.0.0',
      httpPort: 8766,
      httpToken: 'secret',
      actor: 'codex-agent',
      writable: true,
      destructive: false,
    });
  });

  it('makes destructive mode imply writable mode', () => {
    expect(parseArgs(['--project-root', '.', '--destructive'])).toMatchObject({
      writable: true,
      destructive: true,
    });
  });

  it('does not consume the next option when a value is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--project-root', '--writable'], {})).toMatchObject({
      projectRoot: '',
      writable: true,
    });
    expect(warn).toHaveBeenCalled();
  });

  it('rejects invalid and out-of-range HTTP ports', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--port', '70000'], {}).httpPort).toBe(0);
    expect(parseArgs(['--port', '-1'], {}).httpPort).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

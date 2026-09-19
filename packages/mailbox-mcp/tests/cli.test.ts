import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('Mailbox MCP CLI arguments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('defaults to read-only stdio', () => {
    expect(parseArgs(['--project-root', '.', '--actor', 'codex'])).toMatchObject({
      actor: 'codex',
      transport: 'stdio',
      writable: false,
      admin: false,
      httpHost: '127.0.0.1',
      httpPort: 0,
    });
  });

  it('parses identity and HTTP options', () => {
    expect(
      parseArgs([
        '--project-root',
        '.',
        '--actor',
        'claude',
        '--session-id',
        'session-1',
        '--name',
        'Claude Code',
        '--role',
        'reviewer',
        '--http',
        '--host',
        '0.0.0.0',
        '--port',
        '8767',
        '--token',
        'secret',
      ]),
    ).toMatchObject({
      actor: 'claude',
      sessionId: 'session-1',
      actorName: 'Claude Code',
      actorRole: 'reviewer',
      transport: 'http',
      httpHost: '0.0.0.0',
      httpPort: 8767,
      httpToken: 'secret',
    });
  });

  it('makes admin imply writable', () => {
    expect(parseArgs(['--project-root', '.', '--actor', 'codex', '--admin'])).toMatchObject({
      writable: true,
      admin: true,
    });
  });

  it('does not consume a following permission option as a missing value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--project-root', '--admin'], {})).toMatchObject({
      projectRoot: '',
      writable: true,
      admin: true,
    });
    expect(warn).toHaveBeenCalled();
  });

  it('accepts only integer HTTP ports in range', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--port', '70000'], {}).httpPort).toBe(0);
    expect(parseArgs(['--port', '12.5'], {}).httpPort).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

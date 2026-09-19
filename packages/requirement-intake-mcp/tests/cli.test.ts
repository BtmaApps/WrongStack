import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('Requirement Intake MCP CLI arguments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('defaults to read-only stdio', () => {
    expect(parseArgs(['--project-root', '.'])).toMatchObject({
      transport: 'stdio',
      writable: false,
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
    });
  });

  it('falls back to the WRONGSTACK_MCP_TOKEN environment variable', () => {
    expect(
      parseArgs(['--project-root', '.', '--http'], { WRONGSTACK_MCP_TOKEN: 'env-token' }),
    ).toMatchObject({
      httpToken: 'env-token',
    });
  });

  it('does not consume a following writable flag as a missing value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--project-root', '--writable'], {})).toMatchObject({
      projectRoot: '',
      writable: true,
    });
    expect(warn).toHaveBeenCalled();
  });

  it('accepts only integer HTTP ports in range', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseArgs(['--port', '65536'], {}).httpPort).toBe(0);
    expect(parseArgs(['--port', '8.5'], {}).httpPort).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

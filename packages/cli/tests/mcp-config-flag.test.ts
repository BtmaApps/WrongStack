import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import {
  effectiveMcpServers,
  parseLaunchMcpServers,
  resolveLaunchMcpServers,
} from '../src/boot/mcp-config-flag.js';

describe('parseLaunchMcpServers', () => {
  it('maps Claude Code .mcp.json entries onto MCPServerConfig', () => {
    const servers = parseLaunchMcpServers(
      JSON.stringify({
        mcpServers: {
          local: { command: 'node', args: ['srv.js'], env: { A: '1' } },
          remote: { type: 'http', url: 'https://mcp.example/mcp', headers: { X: 'y' } },
          stream: { type: 'sse', url: 'https://mcp.example/sse' },
        },
      }),
      'test',
    );
    expect(servers['local']).toEqual({
      command: 'node',
      args: ['srv.js'],
      env: { A: '1' },
      transport: 'stdio',
      enabled: true,
    });
    expect(servers['remote']).toMatchObject({ transport: 'streamable-http', headers: { X: 'y' } });
    expect(servers['stream']).toMatchObject({ transport: 'sse' });
  });

  it('accepts WrongStack transport entries and bare preset names without a wrapper', () => {
    const servers = parseLaunchMcpServers(
      JSON.stringify({ github: {}, mine: { transport: 'stdio', command: 'x' } }),
      'test',
    );
    expect(servers['github']).toEqual({ enabled: true });
    expect(servers['mine']).toMatchObject({ transport: 'stdio', command: 'x' });
  });

  it.each([
    ['not json', /not valid JSON/],
    ['[]', /must be a JSON object/],
    ['{"a":{"type":"ws","url":"x"}}', /unknown type "ws"/],
    ['{"a":{"type":"http"}}', /streamable-http needs a "url"/],
    ['{"a":{"type":"stdio"}}', /stdio needs a "command"/],
    ['{"a":{"command":"x","args":"y"}}', /"args" must be an array/],
    ['{"a":{"command":"x","env":{"K":1}}}', /"env" must be an object of strings/],
  ])('rejects %s', (text, error) => {
    expect(() => parseLaunchMcpServers(text, 'test')).toThrow(error);
  });
});

describe('resolveLaunchMcpServers', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-mcp-flag-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reads a file relative to cwd', async () => {
    await fs.writeFile(
      path.join(tmp, '.mcp.json'),
      JSON.stringify({ mcpServers: { a: { command: 'x' } } }),
    );
    const servers = await resolveLaunchMcpServers({ 'mcp-config': '.mcp.json' }, tmp);
    expect(Object.keys(servers ?? {})).toEqual(['a']);
  });

  it('takes inline JSON as parsed from argv', async () => {
    const { flags } = parseArgs(['--mcp-config', '{"a":{"command":"x"}}', '--strict-mcp-config']);
    expect(flags['strict-mcp-config']).toBe(true);
    const servers = await resolveLaunchMcpServers(flags, tmp);
    expect(servers?.['a']).toMatchObject({ transport: 'stdio' });
  });

  it('fails on a missing file', async () => {
    await expect(resolveLaunchMcpServers({ 'mcp-config': 'nope.json' }, tmp)).rejects.toThrow(
      /cannot read .*nope\.json \(ENOENT\)/,
    );
  });
});

describe('effectiveMcpServers', () => {
  const configured = { a: { command: 'config-a' }, b: { command: 'config-b' } };
  const launch = { b: { command: 'launch-b', enabled: true } };

  it('layers launch servers over configured ones, replacing same names', () => {
    expect(effectiveMcpServers(configured, launch, false)).toEqual({
      a: { command: 'config-a' },
      b: { command: 'launch-b', enabled: true },
    });
  });

  it('drops configured servers when strict', () => {
    expect(effectiveMcpServers(configured, launch, true)).toEqual(launch);
  });
});

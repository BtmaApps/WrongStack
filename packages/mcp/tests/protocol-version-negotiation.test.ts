import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';
import {
  assertSupportedServerProtocolVersion,
  MCP_CONSTANTS,
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../src/constants.js';
import { MCPServer } from '../src/server.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The client-side half of the same rule: a server answering `initialize` with a
 * revision we do not implement is describing itself, not granting us that
 * revision. Adopting it put an unimplemented version on the wire in the
 * `MCP-Protocol-Version` header — claiming a protocol we could not speak.
 *
 * `2024-11-05` lifecycle: "If the client does not support the version in the
 * server's response, it SHOULD disconnect." So an unsupported answer throws,
 * and the caller's connect path tears the session down.
 */
describe('MCP client-side protocol version enforcement', () => {
  function capturedWarn() {
    return vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  it('accepts a version the client actually implements', () => {
    const warn = capturedWarn();
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(assertSupportedServerProtocolVersion('srv', version)).toBe(version);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('disconnects on a version it does not implement', () => {
    const warn = capturedWarn();
    for (const reported of ['2025-06-18', '2026-07-28', '2099-01-01', '']) {
      expect(() => assertSupportedServerProtocolVersion('srv', reported)).toThrow(
        /does not implement/,
      );
    }
    // Every refusal is reported before it throws.
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('names the server, the reported revision and the supported set in the error', () => {
    capturedWarn();
    let thrown: unknown;
    try {
      assertSupportedServerProtocolVersion('weather-srv', '2026-07-28');
    } catch (err) {
      thrown = err;
    }
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).toContain('weather-srv');
    expect(message).toContain('2026-07-28');
    expect(message).toContain(SUPPORTED_PROTOCOL_VERSIONS.join(', '));
  });

  it('logs the mismatch once, structured, naming both sides', () => {
    const warn = capturedWarn();
    expect(() => assertSupportedServerProtocolVersion('weather-srv', '2026-07-28')).toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      level: 'warn',
      event: 'mcp.protocol_version_mismatch',
      server: 'weather-srv',
      reported: '2026-07-28',
      supported: [...SUPPORTED_PROTOCOL_VERSIONS],
    });
  });

  /**
   * The disconnect must be real, not just an exception. A stdio refusal that
   * left the child running would strand an OS process per rejected server.
   *
   * The fixture deliberately IGNORES stdin EOF (it holds the event loop with a
   * timer), so the graceful path cannot satisfy it and the test actually
   * exercises `closeInner`'s escalation to `forceKillTree`. The assertion is
   * OS-level — the PID is gone — because a force-killed process never runs an
   * `exit` handler, so no in-process marker could prove the kill happened.
   */
  it('terminates the stdio child instead of orphaning it', async () => {
    capturedWarn();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-version-refusal-'));
    const serverPath = path.join(dir, 'future-server.mjs');
    const markerPath = path.join(dir, 'seen.txt');
    const pidPath = path.join(dir, 'pid.txt');
    await writeFile(
      serverPath,
      [
        "import * as readline from 'node:readline';",
        "import { appendFileSync, writeFileSync } from 'node:fs';",
        `const marker = ${JSON.stringify(markerPath)};`,
        // A stubborn server: keeps itself alive after stdin closes, so only a
        // real terminate/SIGKILL can end it.
        'setInterval(() => {}, 1000);',
        `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
        'const rl = readline.createInterface({ input: process.stdin, terminal: false });',
        "rl.on('line', (line) => {",
        '  let msg;',
        '  try { msg = JSON.parse(line); } catch { return; }',
        "  appendFileSync(marker, msg.method + '\\n');",
        "  if (msg.method === 'initialize') {",
        "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {",
        "      protocolVersion: '2026-07-28',",
        "      capabilities: { tools: {} }, serverInfo: { name: 'future', version: '0.0.0' } } }) + '\\n');",
        '  }',
        '});',
      ].join('\n'),
      'utf8',
    );

    const client = new MCPClient({
      name: 'future-stdio',
      transport: 'stdio',
      command: process.execPath,
      args: [serverPath],
      startupTimeoutMs: 15_000,
      requestTimeoutMs: 10_000,
    });
    try {
      await expect(client.connect()).rejects.toThrow(/2026-07-28/);
      expect(client.getState()).toBe('failed');

      // Nothing after `initialize` may reach a server we refused.
      const seen = (await readFile(markerPath, 'utf8')).trim().split('\n');
      expect(seen).toEqual(['initialize']);

      // connect() awaited close(), so the escalation has already run. Poll for
      // the PID to disappear (ESRCH) rather than sleeping a guess.
      const pid = Number(await readFile(pidPath, 'utf8'));
      expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
      const deadline = Date.now() + 5_000;
      let alive = true;
      while (Date.now() < deadline) {
        try {
          process.kill(pid, 0);
        } catch {
          alive = false;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(alive, `stdio child ${pid} survived the refused handshake`).toBe(false);
    } finally {
      await client.close().catch(() => {});
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

/**
 * The server used to ignore the client's requested protocolVersion entirely
 * and always answer with its own constant. A peer asking for a newer revision
 * was told it had been granted that handshake when it had not — silently, with
 * nothing in the response to reveal the mismatch.
 */
describe('MCP protocol version negotiation', () => {
  const server = new MCPServer({
    host: { listTools: () => [], callTool: async () => ({ content: '', isError: false }) },
  });

  async function initialize(protocolVersion: unknown): Promise<{ protocolVersion: string }> {
    const raw = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
    );
    return (JSON.parse(raw ?? '{}') as { result: { protocolVersion: string } }).result;
  }

  it('advertises the newest revision it actually implements', () => {
    expect(MCP_CONSTANTS.PROTOCOL_VERSION).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(SUPPORTED_PROTOCOL_VERSIONS.length).toBeGreaterThan(0);
  });

  it('echoes a supported version back to the peer', async () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(negotiateProtocolVersion(version)).toBe(version);
      await expect(initialize(version)).resolves.toMatchObject({ protocolVersion: version });
    }
  });

  it('answers an unsupported version with its own latest, not the request', async () => {
    // The peer can then decide whether it can speak this revision. Silently
    // echoing its request would claim support that does not exist.
    const result = await initialize('2099-01-01');
    expect(result.protocolVersion).toBe(MCP_CONSTANTS.PROTOCOL_VERSION);
    expect(result.protocolVersion).not.toBe('2099-01-01');
  });

  it('falls back to its own latest for a missing or malformed version', async () => {
    expect(negotiateProtocolVersion(undefined)).toBe(MCP_CONSTANTS.PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(null)).toBe(MCP_CONSTANTS.PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(42)).toBe(MCP_CONSTANTS.PROTOCOL_VERSION);
    await expect(initialize(undefined)).resolves.toMatchObject({
      protocolVersion: MCP_CONSTANTS.PROTOCOL_VERSION,
    });
  });
});

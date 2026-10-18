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

  it('closes pooled Kanban server connections when ping fails or transport setup throws', async () => {
    const fs = await import('node:fs');
    const net = await import('node:net');
    const os = await import('node:os');
    const path = await import('node:path');
    const { canonicalProjectRoot } = await import('@wrongstack/core/utils');
    const {
      closeKanbanServerConnections,
      KANBAN_PROJECT_SERVER_PROTOCOL_VERSION,
      kanbanProjectServerEndpoint,
    } = await import('@wrongstack/kanban');
    const { main } = await import('../src/main.js');

    const rawTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-kanban-mcp-cli-'));
    const projectRoot = canonicalProjectRoot(rawTmpDir);
    const endpoint = kanbanProjectServerEndpoint(projectRoot);
    if (!endpoint.startsWith('\\\\.\\pipe\\')) {
      fs.mkdirSync(path.dirname(endpoint), { recursive: true });
    }

    let activeSockets = 0;
    let pingFails = true;
    const server = net.createServer((socket) => {
      activeSockets++;
      socket.on('close', () => {
        activeSockets--;
      });
      socket.write(
        `${JSON.stringify({
          type: 'hello',
          protocolVersion: KANBAN_PROJECT_SERVER_PROTOCOL_VERSION,
          pid: process.pid,
          projectRoot,
          startedAt: new Date().toISOString(),
        })}\n`,
      );
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const req = JSON.parse(line) as { id: number; method: string };
          if (req.method === 'ping' && pingFails) {
            socket.write(
              `${JSON.stringify({
                type: 'response',
                id: req.id,
                ok: false,
                error: 'ping failed',
                code: 'INTERNAL_ERROR',
              })}\n`,
            );
          } else {
            socket.write(
              `${JSON.stringify({
                type: 'response',
                id: req.id,
                ok: true,
                result: {
                  pid: process.pid,
                  projectRoot,
                  startedAt: new Date().toISOString(),
                  protocolVersion: KANBAN_PROJECT_SERVER_PROTOCOL_VERSION,
                },
              })}\n`,
            );
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(endpoint, resolve));
    try {
      const code = await main(['--project-root', projectRoot]);
      await new Promise((r) => setTimeout(r, 30));
      expect(code).toBe(3);
      expect(activeSockets).toBe(0);

      pingFails = false;
      await expect(
        main(['--project-root', projectRoot, '--http', '--host', '0.0.0.0']),
      ).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 30));
      expect(activeSockets).toBe(0);
    } finally {
      closeKanbanServerConnections();
      server.close();
      fs.rmSync(rawTmpDir, { recursive: true, force: true });
    }
  });
});

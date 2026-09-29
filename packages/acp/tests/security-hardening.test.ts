/**
 * Security regression tests for ACP callback authorization, symlink-aware
 * filesystem containment, and terminal environment sanitization.
 *
 * These tests prove the exploit paths identified in the 2026-07-17 security
 * review are closed:
 *
 * 1. fs/write_text_file is denied when the permission policy rejects
 * 2. terminal/create is denied when the permission policy rejects
 * 3. fs/read_text_file through an in-project symlink escapes root → rejected
 * 4. fs/write_text_file through an in-project symlink escapes root → rejected
 * 5. TerminalServer strips host credentials from child env
 * 6. TerminalServer denies agent env overrides for NODE_OPTIONS/LD_PRELOAD/PATH
 */
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACPSession } from '../src/client/acp-session.js';
import { FileServer } from '../src/client/file-server.js';
import { defaultPermissionPolicy, readOnlyPermissionPolicy } from '../src/client/permission.js';
import { TerminalServer } from '../src/client/terminal-server.js';
import type { ACPMessage } from '../src/types/acp-messages.js';

// ── Symlink-aware containment ─────────────────────────────────────────────

describe('FileServer symlink-escape prevention', () => {
  let projectRoot: string;
  let outsideRoot: string;
  let server: FileServer;

  beforeEach(async () => {
    projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'wstack-symlink-'));
    outsideRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'wstack-outside-'));
    server = new FileServer({ projectRoot });
  });

  afterEach(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(outsideRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('rejects reading through an in-project symlink that points outside root', async ({ skip }) => {
    const linkPath = path.join(projectRoot, 'escape-link');
    const targetFile = path.join(outsideRoot, 'secret.txt');
    await fsp.writeFile(targetFile, 'host-secret', 'utf8');
    try {
      await fsp.symlink(targetFile, linkPath);
    } catch {
      return skip('OS does not allow unprivileged symlinks');
    }

    await expect(server.readTextFile({ sessionId: 's1', path: linkPath })).rejects.toMatchObject({
      code: 'OUTSIDE_ROOT',
    });
  });

  it('rejects writing through an in-project symlink that points outside root', async ({ skip }) => {
    const linkPath = path.join(projectRoot, 'escape-write-link');
    const targetFile = path.join(outsideRoot, 'target.txt');
    await fsp.writeFile(targetFile, 'before', 'utf8');
    try {
      await fsp.symlink(targetFile, linkPath);
    } catch {
      return skip('OS does not allow unprivileged symlinks');
    }

    await expect(
      server.writeTextFile({ sessionId: 's1', path: linkPath, content: 'evil' }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' });

    const content = await fsp.readFile(targetFile, 'utf8');
    expect(content).toBe('before');
  });

  it('rejects writing to a new file whose parent dir is an escaping symlink', async ({ skip }) => {
    const linkDir = path.join(projectRoot, 'escape-dir-link');
    try {
      await fsp.symlink(outsideRoot, linkDir);
    } catch {
      return skip('OS does not allow unprivileged symlinks');
    }
    const newPath = path.join(linkDir, 'newfile.txt');

    await expect(
      server.writeTextFile({ sessionId: 's1', path: newPath, content: 'evil' }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' });
  });

  it('allows reading a regular in-root file (no false positives)', async () => {
    const p = path.join(projectRoot, 'safe.txt');
    await fsp.writeFile(p, 'safe-content', 'utf8');
    const result = await server.readTextFile({ sessionId: 's1', path: p });
    expect(result.content).toBe('safe-content');
  });

  it('rejects reading a file larger than maxReadBytes', async () => {
    const p = path.join(projectRoot, 'big.txt');
    await fsp.writeFile(p, 'x'.repeat(2048), 'utf8');
    const smallServer = new FileServer({ projectRoot, maxReadBytes: 1024 });
    await expect(smallServer.readTextFile({ sessionId: 's1', path: p })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });

  it('rejects writing content larger than maxWriteBytes', async () => {
    const p = path.join(projectRoot, 'out.txt');
    const smallServer = new FileServer({ projectRoot, maxWriteBytes: 100 });
    await expect(
      smallServer.writeTextFile({ sessionId: 's1', path: p, content: 'x'.repeat(200) }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });
});

// ── Terminal environment sanitization ─────────────────────────────────────

describe('TerminalServer environment sanitization', () => {
  let projectRoot: string;
  let server: TerminalServer;

  beforeEach(async () => {
    projectRoot = path.resolve(
      os.tmpdir(),
      'wstack-term-sec-' + Math.random().toString(36).slice(2),
    );
    await fsp.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    server?.releaseAll();
    await fsp.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('strips host API credentials from the child environment', async () => {
    const testKey = 'test_credential_value_placeholder';
    process.env['ANTHROPIC_API_KEY'] = testKey;
    try {
      server = new TerminalServer({ projectRoot, commandTimeoutMs: 10_000 });
      const { terminalId } = server.create({
        sessionId: 's1',
        command: 'node',
        args: ['-e', 'console.log(process.env.ANTHROPIC_API_KEY ?? "UNDEF")'],
      });
      await server.waitForExit(terminalId);
      const out = server.output(terminalId);
      expect(out.output.trim()).toBe('UNDEF');
    } finally {
      delete process.env['ANTHROPIC_API_KEY'];
    }
  });

  it('denies agent env override for NODE_OPTIONS (prevents --require injection)', async () => {
    server = new TerminalServer({ projectRoot, commandTimeoutMs: 10_000 });
    const { terminalId } = server.create({
      sessionId: 's1',
      command: 'node',
      args: ['-e', 'console.log(process.env.NODE_OPTIONS ?? "UNDEF")'],
      env: [{ name: 'NODE_OPTIONS', value: '--require /tmp/evil.js' }],
    });
    await server.waitForExit(terminalId);
    const out = server.output(terminalId);
    expect(out.output.trim()).not.toContain('--require');
    expect(out.output.trim()).not.toContain('evil.js');
  });

  it('denies agent env override for LD_PRELOAD', async () => {
    server = new TerminalServer({ projectRoot, commandTimeoutMs: 10_000 });
    const { terminalId } = server.create({
      sessionId: 's1',
      command: 'node',
      args: ['-e', 'console.log(process.env.LD_PRELOAD ?? "UNDEF")'],
      env: [{ name: 'LD_PRELOAD', value: '/tmp/evil.so' }],
    });
    await server.waitForExit(terminalId);
    const out = server.output(terminalId);
    expect(out.output.trim()).toBe('UNDEF');
  });

  it('denies agent env override for PATH (prevents binary hijacking)', async () => {
    server = new TerminalServer({ projectRoot, commandTimeoutMs: 10_000 });
    const { terminalId } = server.create({
      sessionId: 's1',
      command: 'node',
      args: [
        '-e',
        'const p = process.env.PATH ?? ""; console.log(p.includes("/tmp/evil") ? "INJECTED" : "SAFE")',
      ],
      env: [{ name: 'PATH', value: '/tmp/evil/bin:/usr/bin' }],
    });
    await server.waitForExit(terminalId);
    const out = server.output(terminalId);
    expect(out.output.trim()).toBe('SAFE');
  });

  it('allows non-dangerous agent env overrides', async () => {
    server = new TerminalServer({ projectRoot, commandTimeoutMs: 10_000 });
    const { terminalId } = server.create({
      sessionId: 's1',
      command: 'node',
      args: ['-e', 'console.log(process.env.MY_SAFE_VAR ?? "UNDEF")'],
      env: [{ name: 'MY_SAFE_VAR', value: 'safe-value' }],
    });
    await server.waitForExit(terminalId);
    const out = server.output(terminalId);
    expect(out.output.trim()).toBe('safe-value');
  });
});

// ── Callback authorization gate ───────────────────────────────────────────

const hoisted = vi.hoisted(() => ({ instances: [] as FakeTransport[] }));

interface FakeTransport {
  sent: ACPMessage[];
  handlers: Array<(m: ACPMessage) => void>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  onMessage: (h: (m: ACPMessage) => void) => () => void;
  emit: (m: ACPMessage) => void;
  respond: (id: number | string, method: string, result: unknown) => void;
}

vi.mock('../src/agent/stdio-transport.js', async () => {
  // Dynamic, not a static import: vi.mock is hoisted above the imports, so the
  // shared helper would not be initialised when this factory body runs.
  const { FakeClientTransport } = await import('./helpers/fake-client-transport.js');
  class ClientTransport extends FakeClientTransport {
    constructor() {
      super();
      (hoisted as unknown as { instances: unknown[] }).instances.push(this);
    }
    respond(id: number | string, _method: string, result: unknown): void {
      this.emit({ jsonrpc: '2.0', id, result } as never as ACPMessage);
    }
  }
  return { ClientTransport, StdioTransport: class {} };
});

const SESSION_PROJECT_ROOT = path.resolve(os.tmpdir(), 'wstack-acp-sec-test-' + process.pid);

function lastTransport(): FakeTransport {
  const t = hoisted.instances[hoisted.instances.length - 1];
  if (!t) throw new Error('no transport was constructed');
  return t;
}

async function startSession(
  overrides: Partial<Parameters<typeof ACPSession.start>[0]> = {},
): Promise<ACPSession> {
  const p = ACPSession.start({ command: 'fake', projectRoot: SESSION_PROJECT_ROOT, ...overrides });
  const t = lastTransport();
  await new Promise((r) => setImmediate(r));
  const init = t.sent.find((m) => m.method === 'initialize');
  t.respond(init!.id!, 'initialize', {
    protocolVersion: 1,
    agentCapabilities: { loadSession: true, promptCapabilities: { image: true } },
    agentInfo: { name: 'fake-agent', title: 'Fake', version: '0.0.1' },
  });
  return p;
}

describe('ACPSession callback authorization gate', () => {
  beforeEach(async () => {
    hoisted.instances.length = 0;
    await fsp.mkdir(SESSION_PROJECT_ROOT, { recursive: true });
  });

  afterEach(async () => {
    hoisted.instances.length = 0;
    for (let i = 0; i < 3; i++) {
      try {
        await fsp.rm(SESSION_PROJECT_ROOT, { recursive: true, force: true });
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'EBUSY' && code !== 'ENOTEMPTY') throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  });

  it('denies fs/write_text_file when read-only policy is set', async () => {
    const session = await startSession({ permissionPolicy: readOnlyPermissionPolicy });
    const t = lastTransport();

    const id = 200;
    const filePath = path.join(SESSION_PROJECT_ROOT, 'evil.txt');
    t.emit({
      jsonrpc: '2.0',
      id,
      method: 'fs/write_text_file',
      params: { sessionId: 'sess_abc', path: filePath, content: 'malicious' },
    } as never as ACPMessage);
    await new Promise((r) => setImmediate(r));

    const response = t.sent.find((m) => m.id === id) as
      | { error?: { code?: number; message?: string } }
      | undefined;
    expect(response?.error).toBeDefined();
    expect(response!.error!.message).toContain('denied by permission policy');

    await session.close();
  });

  it('routes privileged callbacks through the shared TrustBoundary', async () => {
    const evaluate = vi.fn(async () => ({ kind: 'deny', reason: 'adapter policy' }) as const);
    const session = await startSession({
      trustBoundary: { evaluate },
      trustActor: { kind: 'subagent', id: 'agent-1' },
      trustScope: { projectId: 'project-1', cwd: SESSION_PROJECT_ROOT },
    });
    const t = lastTransport();
    const id = 202;
    const filePath = path.join(SESSION_PROJECT_ROOT, 'denied.txt');
    t.emit({
      jsonrpc: '2.0',
      id,
      method: 'fs/write_text_file',
      params: { sessionId: 'sess_abc', path: filePath, content: 'blocked' },
    } as never as ACPMessage);
    await new Promise((r) => setImmediate(r));

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { kind: 'subagent', id: 'agent-1', sessionId: 'sess_abc' },
        surface: 'acp',
        capability: 'filesystem.write',
        subject: expect.objectContaining({ kind: 'path', id: filePath }),
        scope: { projectId: 'project-1', cwd: SESSION_PROJECT_ROOT, sessionId: 'sess_abc' },
      }),
    );
    const response = t.sent.find((message) => message.id === id) as
      | { error?: { message?: string } }
      | undefined;
    expect(response?.error?.message).toContain('denied by permission policy');
    await expect(fsp.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await session.close();
  });

  it('allows fs/read_text_file under read-only policy', async () => {
    const session = await startSession({ permissionPolicy: readOnlyPermissionPolicy });
    const t = lastTransport();

    const filePath = path.join(SESSION_PROJECT_ROOT, 'readable.txt');
    await fsp.writeFile(filePath, 'hello', 'utf8');

    const id = 201;
    t.emit({
      jsonrpc: '2.0',
      id,
      method: 'fs/read_text_file',
      params: { sessionId: 'sess_abc', path: filePath },
    } as never as ACPMessage);
    await new Promise((r) => setTimeout(r, 100));

    const response = t.sent.find((m) => m.id === id && m.result !== undefined) as
      | { result?: { content?: string } }
      | undefined;
    expect(response).toBeDefined();
    expect(response!.result!.content).toBe('hello');

    await session.close();
  });

  it('denies terminal/create when read-only policy is set', async () => {
    const session = await startSession({ permissionPolicy: readOnlyPermissionPolicy });
    const t = lastTransport();

    const id = 300;
    t.emit({
      jsonrpc: '2.0',
      id,
      method: 'terminal/create',
      params: {
        sessionId: 'sess_abc',
        command: 'node',
        args: ['-e', 'console.log("escaped")'],
      },
    } as never as ACPMessage);
    await new Promise((r) => setImmediate(r));

    const response = t.sent.find((m) => m.id === id) as
      | { error?: { code?: number; message?: string } }
      | undefined;
    expect(response?.error).toBeDefined();
    expect(response!.error!.message).toContain('denied by permission policy');

    await session.close();
  });

  it('allows terminal/create under explicit auto-approve policy', async () => {
    const session = await startSession({ permissionPolicy: defaultPermissionPolicy });
    const t = lastTransport();

    const id = 301;
    t.emit({
      jsonrpc: '2.0',
      id,
      method: 'terminal/create',
      params: {
        sessionId: 'sess_abc',
        command: 'node',
        args: ['-e', 'console.log("allowed")'],
        cwd: SESSION_PROJECT_ROOT,
      },
    } as never as ACPMessage);
    await new Promise((r) => setImmediate(r));

    const response = t.sent.find((m) => m.id === id) as
      | { result?: { terminalId?: string } }
      | undefined;
    expect(response?.result?.terminalId).toMatch(/^term_/);

    await session.close();
  });
});

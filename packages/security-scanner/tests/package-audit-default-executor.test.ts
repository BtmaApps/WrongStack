import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcess = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => childProcess.execFile(...args),
}));

const shim = vi.hoisted(() => ({ refuse: false }));
vi.mock('@wrongstack/core/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wrongstack/core/utils')>();
  return {
    ...actual,
    buildWin32CmdShimInvocation: (
      ...args: Parameters<typeof actual.buildWin32CmdShimInvocation>
    ) => {
      if (shim.refuse) throw new Error('shim refused the arguments');
      return actual.buildWin32CmdShimInvocation(...args);
    },
  };
});

import { PackageAuditRunner } from '../src/package-audit.js';

let root: string;
let originalPlatform: NodeJS.Platform;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-executor-'));
  await fs.writeFile(path.join(root, 'package-lock.json'), '');
  originalPlatform = process.platform;
  childProcess.execFile.mockReset();
  shim.refuse = false;
});

afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  await fs.rm(root, { recursive: true, force: true });
});

function respond(error: (Error & { code?: string | number }) | null, stdout?: string): void {
  childProcess.execFile.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout?: string, stderr?: string) => void,
    ) => callback(error, stdout, undefined),
  );
}

describe('default package audit executor', () => {
  it('runs the bare executable on POSIX and maps a successful exit', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    respond(null, JSON.stringify({ vulnerabilities: {} }));
    const result = await new PackageAuditRunner().run(root);
    expect(childProcess.execFile.mock.calls[0]?.[0]).toBe('npm');
    expect(result.exitCode).toBe(0);
  });

  it('uses the cmd shim on Windows and preserves numeric audit exit codes', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const error = Object.assign(new Error('vulnerabilities found'), { code: 1 });
    respond(error, JSON.stringify({ vulnerabilities: {} }));
    const result = await new PackageAuditRunner().run(root);
    const [command, args, options] = childProcess.execFile.mock.calls[0] as [
      string,
      string[],
      { shell?: unknown; windowsVerbatimArguments?: boolean },
    ];
    // The `.cmd` shim runs through `cmd.exe /d /c call "npm" ...`, never
    // through `shell: true` — a shell would let a metacharacter in an argument
    // chain a second command (CVE-2024-27980 / WS-SEC-11).
    expect(command).toBe(process.env['COMSPEC'] ?? 'cmd.exe');
    expect(args).toEqual(['/d', '/c', 'call "npm" "audit" "--json"']);
    expect(options.windowsVerbatimArguments).toBe(true);
    expect(options.shell).toBeUndefined();
    expect(result.exitCode).toBe(1);
    expect(result.success).toBe(true);
  });

  it('reports a refused Windows shim without spawning anything', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    shim.refuse = true;
    const result = await new PackageAuditRunner().run(root);
    expect(childProcess.execFile).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      exitCode: null,
      success: false,
      error: 'shim refused the arguments',
    });
  });

  it('reports execFile throwing synchronously', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    childProcess.execFile.mockImplementation(() => {
      throw new Error('EAGAIN');
    });
    const result = await new PackageAuditRunner().run(root);
    expect(result).toMatchObject({ exitCode: null, success: false, error: 'EAGAIN' });
  });

  it('reports an executor that rejects', async () => {
    const result = await new PackageAuditRunner(async () => {
      throw new Error('executor exploded');
    }).run(root);
    expect(result).toMatchObject({
      packageManager: 'npm',
      exitCode: null,
      success: false,
      skipped: false,
    });
  });

  it('maps non-numeric process failures to a null exit code', async () => {
    const error = Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
    respond(error);
    const result = await new PackageAuditRunner().run(root);
    expect(result.exitCode).toBeNull();
    expect(result.success).toBe(false);
  });
});

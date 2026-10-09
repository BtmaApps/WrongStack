/**
 * Regression: on Windows, a cwd that differs from the project root only in
 * case (the lowercase drive letter file-URI clients send) failed the
 * containment check and the command silently ran in the project ROOT instead
 * of the requested subdirectory.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalServer } from '../src/client/terminal-server.js';

const flipDrive = (p: string): string =>
  p[0] === p[0]!.toUpperCase()
    ? p[0]!.toLowerCase() + p.slice(1)
    : p[0]!.toUpperCase() + p.slice(1);

describe.skipIf(process.platform !== 'win32')('TerminalServer cwd on Windows', () => {
  let base = '';
  let server: TerminalServer | undefined;

  afterEach(() => {
    server?.dispose();
    if (base) fs.rmSync(base, { recursive: true, force: true });
  });

  async function cwdOf(cwd: string): Promise<string> {
    const { terminalId } = server!.create({
      sessionId: 's',
      command: process.execPath,
      args: ['-e', 'process.stdout.write(process.cwd())'],
      cwd,
    });
    await server!.waitForExit(terminalId);
    return server!.output(terminalId).output.trim().toLowerCase();
  }

  it('runs in the requested subdirectory when only the casing differs', async () => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cwd-')));
    const root = path.join(base, 'proj');
    const sub = path.join(root, 'packages', 'app');
    fs.mkdirSync(sub, { recursive: true });
    fs.mkdirSync(path.join(base, 'proj-evil'));
    server = new TerminalServer({ projectRoot: root });

    expect(await cwdOf(flipDrive(sub))).toBe(sub.toLowerCase());
    expect(await cwdOf(sub.toUpperCase())).toBe(sub.toLowerCase());
    // Containment still holds for case-variant paths outside the root.
    expect(await cwdOf(flipDrive(path.join(base, 'proj-evil')))).toBe(root.toLowerCase());
  });
});

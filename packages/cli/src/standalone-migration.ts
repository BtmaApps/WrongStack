import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { buildChildEnv } from '@wrongstack/core/utils';
import windowsInstaller from '../../../scripts/install.ps1' with { type: 'text' };
import posixInstaller from '../../../scripts/install.sh' with { type: 'text' };
import type { TerminalRenderer } from './renderer.js';

/** Bundle the canonical installers so migration fixes also apply to older GitHub releases. */
export async function migrateToStandalone(options: {
  version: string;
  userHome: string;
  renderer: Pick<TerminalRenderer, 'write'>;
}): Promise<number> {
  const { renderer, version } = options;
  let scratch: string | undefined;
  try {
    if (!/^\d+\.\d+\.\d+$/.test(version))
      throw new Error('GitHub returned an invalid stable release version');
    const windows = process.platform === 'win32';
    const scriptName = windows ? 'install.ps1' : 'install.sh';
    renderer.write(
      `Installing the v${version} GitHub Releases binary and removing legacy global packages...\n`,
    );
    const script = windows ? windowsInstaller : posixInstaller;
    if (script.length === 0) throw new Error('The release installer is empty');
    scratch = await mkdtemp(path.join(tmpdir(), 'wstack-migrate-'));
    const scriptPath = path.join(scratch, scriptName);
    await writeFile(scriptPath, script, { mode: 0o600, flag: 'wx' });
    // Do not inherit a download mirror or a disabled PATH update during migration.
    // The installer needs no credentials: buildChildEnv strips provider keys and
    // the vault passphrase while keeping PATH/HOME/APPDATA for the package managers.
    // Proxy settings are the exception: curl / Invoke-WebRequest download the
    // binary through them, and buildChildEnv drops a proxy URL that carries a
    // password, which would break the update behind an authenticated proxy.
    const proxy = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name, value]) => value && /^(?:https?|all|no)_proxy$/i.test(name),
      ),
    );
    const env: NodeJS.ProcessEnv = {
      ...buildChildEnv({ extra: proxy }),
      WSTACK_VERSION: version,
      WSTACK_MIGRATION: '1',
      // Never place the new binary inside a package tree about to be removed.
      WSTACK_INSTALL_DIR: path.join(options.userHome, '.wrongstack', 'bin'),
    };
    delete env['WSTACK_DOWNLOAD_BASE'];
    delete env['WSTACK_NO_MODIFY_PATH'];
    const executable = windows
      ? path.join(
          process.env['SystemRoot'] ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        )
      : '/bin/sh';
    const args = windows
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
      : [scriptPath];
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: options.userHome,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        signal: AbortSignal.timeout(900_000),
      });
      child.stdout?.on('data', (chunk) => renderer.write(String(chunk)));
      child.stderr?.on('data', (chunk) => renderer.write(String(chunk)));
      child.once('error', reject);
      child.once('close', (status, signal) => {
        if (status !== 0 || signal)
          renderer.write(`Binary migration failed (${signal ?? status ?? 'unknown exit'}).\n`);
        resolve(signal ? 1 : (status ?? 1));
      });
    });
    if (code === 0)
      renderer.write('Binary migration completed. Open a new terminal, then run wstack version.\n');
    return code;
  } catch (error) {
    renderer.write(
      `Binary migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

import { type ChildProcess, spawn } from 'node:child_process';
import { BoundedProcessOutput } from './command-security.js';

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** When true, the command was rejected by the security gate before execution. */
  rejected?: boolean | undefined;
}

export class VerificationProcessRunner {
  constructor(readonly projectRoot: string) {}

  private terminateProcessTree(child: ChildProcess, detachedProcessGroup: boolean): void {
    const pid = child.pid;
    if (typeof pid === 'number' && process.platform === 'win32') {
      try {
        const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        const forceKillChild = (): void => {
          try {
            child.kill('SIGKILL');
          } catch {
            // The process already exited.
          }
        };
        killer.once('error', forceKillChild);
        killer.once('close', (code) => {
          if (code !== 0) forceKillChild();
        });
        killer.unref();
        return;
      } catch {
        // Fall through to direct termination.
      }
    }
    try {
      if (typeof pid === 'number' && detachedProcessGroup) {
        process.kill(-pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'verification_process_termination_failed',
            message: 'Unable to terminate the verification child process.',
            pid,
            timestamp: new Date().toISOString(),
          }),
        );
      }
    }
  }

  async runGitCommand(
    args: string[],
    timeoutMs = 30_000,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const detachedProcessGroup = process.platform !== 'win32';
      const child = spawn('git', args, {
        cwd: this.projectRoot,
        env,
        windowsHide: true,
        detached: detachedProcessGroup,
      });
      const stdout = new BoundedProcessOutput();
      const stderr = new BoundedProcessOutput();
      let settled = false;

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout.append(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr.append(chunk);
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.terminateProcessTree(child, detachedProcessGroup);
        reject(new Error(`git ${args.join(' ')} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (code === 0) resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        else reject(new Error(`git ${args.join(' ')} failed: ${stderr.toString().slice(0, 500)}`));
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }

  /**
   * Spawn a trusted local test runner with an argument array. This private
   * helper is never exposed as a model-selected executable surface.
   */
  async runProcess(
    command: string,
    args: string[],
    opts: { cwd: string; timeoutMs: number; shell?: boolean | undefined },
  ): Promise<CommandResult> {
    const start = Date.now();
    const displayCommand = [command, ...args].join(' ');
    return new Promise<CommandResult>((resolve) => {
      const detachedProcessGroup = process.platform !== 'win32';
      const child = spawn(command, args, {
        cwd: opts.cwd,
        shell: opts.shell ?? false,
        windowsHide: true,
        detached: detachedProcessGroup,
      });
      const stdout = new BoundedProcessOutput();
      const stderr = new BoundedProcessOutput();
      let timedOut = false;
      let settled = false;

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout.append(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr.append(chunk);
      });

      let timer: NodeJS.Timeout | undefined;
      const finish = (exitCode: number, suffix = ''): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({
          command: displayCommand,
          exitCode,
          stdout: stdout.toString(),
          stderr: `${stderr.toString()}${suffix}`,
          durationMs: Date.now() - start,
        });
      };

      timer = setTimeout(() => {
        timedOut = true;
        this.terminateProcessTree(child, detachedProcessGroup);
        finish(-1, `\n--- timed out after ${opts.timeoutMs}ms ---`);
      }, opts.timeoutMs);

      child.on('close', (code) => {
        finish(
          timedOut ? -1 : (code ?? -1),
          timedOut ? `\n--- timed out after ${opts.timeoutMs}ms ---` : '',
        );
      });
      child.on('error', () => {
        finish(
          -1,
          timedOut ? `\n--- timed out after ${opts.timeoutMs}ms ---` : '\n--- spawn error ---',
        );
      });
    });
  }
}

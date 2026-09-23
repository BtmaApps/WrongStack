import { type ChildProcess, spawn } from 'node:child_process';
import * as http from 'node:http';
import * as net from 'node:net';

function hasChildExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Wait for actual process exit; ChildProcess.killed only means a signal was sent. */
export function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasChildExited(child)) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (exited: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(exited);
    };
    const onExit = (): void => finish(true);
    const timer = setTimeout(() => finish(hasChildExited(child)), timeoutMs);
    timer.unref?.();
    child.once('exit', onExit);

    // Close the race between the initial state check and listener registration.
    if (hasChildExited(child)) finish(true);
  });
}

export async function terminateProcessTree(child: ChildProcess | null): Promise<void> {
  if (!child?.pid || hasChildExited(child)) return;
  if (process.platform !== 'win32') {
    // macOS / Linux: send SIGTERM first, then SIGKILL after a grace
    // period. Electron child processes spawned with ELECTRON_RUN_AS_NODE
    // may ignore the initial signal during busy I/O.
    const pid = child.pid;
    const exited = waitForChildExit(child, 5000);
    child.kill('SIGTERM');
    if (await exited) return;

    // Grace period expired — force kill the process tree. Do not use
    // child.killed here: it becomes true as soon as SIGTERM is sent.
    if (!hasChildExited(child)) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      await waitForChildExit(child, 1000);
    }
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, 3000);
    timer.unref?.();
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
    killer.once('error', () => {
      clearTimeout(timer);
      child.kill();
      finish();
    });
  });
}

export async function findFreePort(startPort: number, exclude: Set<number>): Promise<number> {
  for (let port = startPort; port < startPort + 200; port++) {
    if (exclude.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free local port found near ${startPort}`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export function waitForHttpReady(baseUrl: string, token: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('shell', 'desktop');

  return new Promise((resolve, reject) => {
    let probeTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (probeTimer) {
        clearTimeout(probeTimer);
        probeTimer = undefined;
      }
    };

    const probe = (): void => {
      let done = false;

      const triggerRetry = (): void => {
        if (done) return;
        done = true;
        if (Date.now() >= deadline) {
          reject(new Error(`WebUI did not become ready at ${baseUrl}`));
          return;
        }
        probeTimer = setTimeout(probe, 250);
      };

      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          if (!done) {
            done = true;
            cleanup();
            resolve();
          }
          return;
        }
        triggerRetry();
      });

      req.once('error', () => {
        triggerRetry();
      });

      req.setTimeout(1000, () => {
        req.destroy();
        triggerRetry();
      });
    };

    probe();
  });
}

/**
 * A background shell's output goes to a log file the child writes itself, so
 * the job survives the host and its output can be read (by the model, and by
 * the TUI's background strip).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { describe, expect, it } from 'vitest';
import { openBackgroundLog, tailBackgroundLog } from '../src/background-log.js';
import { bashTool } from '../src/bash.js';
import { getProcessRegistry } from '../src/process-registry.js';
import { pwshTool } from '../src/pwsh.js';
import { mkSandbox, newSignal } from './fixtures.js';

async function waitGone(pid: number): Promise<void> {
  const end = Date.now() + 15_000;
  while (Date.now() < end && getProcessRegistry().get(pid)) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('background shell output', () => {
  it('lands in the log_file the result names, stdout and stderr both', async () => {
    const sb = await mkSandbox();
    try {
      const out = await bashTool.execute(
        { command: 'echo bg-out-line && echo bg-err-line 1>&2', background: true },
        sb.ctx,
        { signal: newSignal() },
      );
      expect(out.log_file).toBeDefined();
      const logFile = out.log_file as string;
      const logDir = path.join(resolveWstackPaths({ projectRoot: sb.dir }).projectDir, 'bg-logs');
      expect(path.dirname(logFile)).toBe(logDir);
      expect(getProcessRegistry().get(out.pid as number)?.logFile).toBe(logFile);

      await waitGone(out.pid as number);
      const lines = tailBackgroundLog(logFile, 10).map((l) => l.trim());
      expect(lines).toContain('bg-out-line');
      expect(lines).toContain('bg-err-line');
    } finally {
      await sb.cleanup().catch(() => undefined);
    }
  }, 30_000);

  it('keeps a quoted argument whole (cmd.exe used to split it)', async () => {
    const sb = await mkSandbox();
    try {
      const out = await bashTool.execute(
        { command: `node -e "console.log('quoted ' + (40 + 2))"`, background: true },
        sb.ctx,
        { signal: newSignal() },
      );
      await waitGone(out.pid as number);
      expect(tailBackgroundLog(out.log_file as string, 10).map((l) => l.trim())).toContain(
        'quoted 42',
      );
    } finally {
      await sb.cleanup().catch(() => undefined);
    }
  }, 30_000);

  it.runIf(process.platform === 'win32')(
    'works the same for pwsh',
    async () => {
      const sb = await mkSandbox();
      try {
        const out = await pwshTool.execute(
          { command: "Write-Output 'pwsh-bg-line'", run_in_background: true },
          sb.ctx,
          { signal: newSignal() },
        );
        expect(out.log_file).toBeDefined();
        await waitGone(out.pid as number);
        expect(tailBackgroundLog(out.log_file as string, 10).map((l) => l.trim())).toContain(
          'pwsh-bg-line',
        );
      } finally {
        await sb.cleanup().catch(() => undefined);
      }
    },
    60_000,
  );
});

describe('tailBackgroundLog', () => {
  it('returns the last lines, and nothing for a missing file', async () => {
    const sb = await mkSandbox();
    try {
      const file = path.join(sb.dir, 'x.log');
      fs.writeFileSync(file, Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\r\n'));
      expect(tailBackgroundLog(file, 3)).toEqual(['line 47', 'line 48', 'line 49']);
      expect(tailBackgroundLog(path.join(sb.dir, 'none.log'), 3)).toEqual([]);
    } finally {
      await sb.cleanup();
    }
  });
});

describe('openBackgroundLog pruning', () => {
  it('drops old logs but keeps the ones still in use', async () => {
    const sb = await mkSandbox();
    try {
      const first = openBackgroundLog(sb.dir, 'bash');
      expect(first).toBeDefined();
      fs.closeSync(first?.fd as number);
      const dir = path.dirname(first?.path as string);
      const old = path.join(dir, 'old.log');
      const oldInUse = path.join(dir, 'old-running.log');
      for (const f of [old, oldInUse]) {
        fs.writeFileSync(f, 'x');
        const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        fs.utimesSync(f, fourDaysAgo, fourDaysAgo);
      }
      const next = openBackgroundLog(sb.dir, 'bash', [oldInUse]);
      fs.closeSync(next?.fd as number);
      expect(fs.existsSync(old)).toBe(false);
      expect(fs.existsSync(oldInUse)).toBe(true);
      expect(fs.existsSync(first?.path as string)).toBe(true);
    } finally {
      await sb.cleanup();
    }
  });
});

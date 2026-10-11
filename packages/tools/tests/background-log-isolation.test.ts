import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundLog,
  closeBackgroundLogFd,
  openBackgroundLog,
  tailBackgroundLog,
} from '../src/background-log.js';

let fixture: string;
const logs: BackgroundLog[] = [];
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-bg-isolation-'));
  vi.stubEnv('WRONGSTACK_HOME', path.join(fixture, 'home'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T15:00:00.000Z'));
});
afterEach(() => {
  for (const log of logs.splice(0)) closeBackgroundLogFd(log);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  fs.rmSync(fixture, { recursive: true, force: true });
});
function allocate(tool = 'bash'): BackgroundLog {
  const log = openBackgroundLog(
    path.join(fixture, 'project'),
    tool,
    logs.map((item) => item.path),
  );
  if (!log) throw new Error('fixture log allocation failed');
  logs.push(log);
  return log;
}

describe('per-launch background-log isolation', () => {
  it('keeps same-tool, same-timestamp job output in separate files', () => {
    const first = allocate();
    const second = allocate();
    fs.writeSync(first.fd, 'job-one\n');
    fs.writeSync(second.fd, 'job-two\n');
    expect(first.path).not.toBe(second.path);
    expect(tailBackgroundLog(first.path, 10)).toEqual(['job-one']);
    expect(tailBackgroundLog(second.path, 10)).toEqual(['job-two']);
  });
  it('allocates a fresh file for every launch in a batch', () => {
    const batch = Array.from({ length: 6 }, () => allocate());
    expect(new Set(batch.map((log) => log.path)).size).toBe(6);
    batch.forEach((log, index) => {
      fs.writeSync(log.fd, `job-${index}\n`);
      expect(tailBackgroundLog(log.path, 10)).toEqual([`job-${index}`]);
    });
  });
  it('control: different tools remain isolated', () => {
    const first = allocate('bash');
    const second = allocate('pwsh');
    fs.writeSync(first.fd, 'bash-output\n');
    fs.writeSync(second.fd, 'pwsh-output\n');
    expect(tailBackgroundLog(first.path, 10)).toEqual(['bash-output']);
    expect(tailBackgroundLog(second.path, 10)).toEqual(['pwsh-output']);
  });
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  closeDaemonLogFd,
  openDaemonLogFd,
  SAGE_DAEMON_LOG_MAX_BYTES,
} from '../src/daemon-log.js';

describe('openDaemonLogFd', () => {
  it('creates the store directory, writes the header, and accepts daemon output', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-daemon-log-'));
    try {
      const logPath = path.join(root, 'memories', 'daemon.log');
      const fd = openDaemonLogFd(logPath, 'header line\n');
      if (fd === null) throw new Error('expected a usable log fd');
      fs.writeFileSync(fd, 'daemon stderr line\n');
      closeDaemonLogFd(fd);
      expect(fs.readFileSync(logPath, 'utf8')).toBe('header line\ndaemon stderr line\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to null instead of throwing when the sink is unusable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-daemon-log-bad-'));
    try {
      const blocker = path.join(root, 'blocker');
      fs.writeFileSync(blocker, 'a file where a directory is needed');
      expect(openDaemonLogFd(path.join(blocker, 'daemon.log'), 'header\n')).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('appends across spawns instead of truncating prior crashes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-daemon-log-append-'));
    try {
      const logPath = path.join(root, 'daemon.log');
      const first = openDaemonLogFd(logPath, 'spawn one\n');
      closeDaemonLogFd(first);
      const second = openDaemonLogFd(logPath, 'spawn two\n');
      closeDaemonLogFd(second);
      expect(fs.readFileSync(logPath, 'utf8')).toBe('spawn one\nspawn two\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rotates an oversized log into a single .1 generation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-daemon-log-rot-'));
    try {
      const logPath = path.join(root, 'daemon.log');
      fs.writeFileSync(logPath, 'x'.repeat(SAGE_DAEMON_LOG_MAX_BYTES + 1));
      const fd = openDaemonLogFd(logPath, 'fresh\n');
      closeDaemonLogFd(fd);
      expect(fs.statSync(`${logPath}${'.1'}`).size).toBe(SAGE_DAEMON_LOG_MAX_BYTES + 1);
      expect(fs.readFileSync(logPath, 'utf8')).toBe('fresh\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('closeDaemonLogFd', () => {
  it('tolerates null and double closes', () => {
    expect(() => closeDaemonLogFd(null)).not.toThrow();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-daemon-log-close-'));
    try {
      const fd = openDaemonLogFd(path.join(root, 'daemon.log'), 'h\n');
      if (fd === null) throw new Error('expected a usable log fd');
      closeDaemonLogFd(fd);
      expect(() => closeDaemonLogFd(fd)).not.toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

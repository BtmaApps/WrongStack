import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ write: false, collision: false, failedPath: '' }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      if (fault.collision) {
        fault.failedPath = String(args[0]);
        actual.writeFileSync(args[0], 'another creator');
        throw Object.assign(new Error('exclusive acquisition lost'), { code: 'EEXIST' });
      }
      return actual.openSync(...args);
    },
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (fault.write) {
        actual.writeFileSync(args[0], 'partial-secret', args[2]);
        throw Object.assign(new Error('disk full after partial write'), { code: 'ENOSPC' });
      }
      return actual.writeFileSync(...args);
    },
  };
});

import { __createIpcEndpointSecretForTests as create } from '../src/ipc-endpoint-secret.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-partial-write-'));
});
afterEach(() => {
  fault.write = false;
  fault.collision = false;
  fault.failedPath = '';
  fs.rmSync(root, { recursive: true, force: true });
});

describe('IPC secret temporary write ownership', () => {
  it('cleans partial writes across repeated failures and can then retry', () => {
    const file = path.join(root, 'secret');
    fault.write = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(create(file)).toBeNull();
      expect(fs.readdirSync(root)).toEqual([]);
    }
    fault.write = false;
    expect(create(file)).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readdirSync(root)).toEqual(['secret']);
  });

  it('preserves the winning secret when our temporary write fails', () => {
    const file = path.join(root, 'secret');
    const winner = 'a'.repeat(64);
    fs.writeFileSync(file, winner);
    fault.write = true;
    expect(create(file)).toBe(winner);
    expect(fs.readFileSync(file, 'utf8')).toBe(winner);
    expect(fs.readdirSync(root)).toEqual(['secret']);
  });

  it('does not remove a temporary file it failed to acquire exclusively', () => {
    fault.collision = true;
    expect(create(path.join(root, 'secret'))).toBeNull();
    expect(fs.readFileSync(fault.failedPath, 'utf8')).toBe('another creator');
    expect(fs.readdirSync(root)).toHaveLength(1);
  });

  it('creates a healthy secret and adopts it on repeated creation', () => {
    const file = path.join(root, 'secret');
    const winner = create(file);
    expect(winner).toMatch(/^[0-9a-f]{64}$/);
    expect(create(file)).toBe(winner);
    expect(fs.readdirSync(root)).toEqual(['secret']);
  });
});

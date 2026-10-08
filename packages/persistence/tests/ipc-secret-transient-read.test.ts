import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ code: 'EMFILE', remaining: 0 }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (fault.remaining > 0) {
        fault.remaining--;
        throw Object.assign(new Error('transient fixture failure'), { code: fault.code });
      }
      return actual.readFileSync(...args);
    },
  };
});

import {
  __resetIpcEndpointSecretForTests,
  _ipcEndpointSecretOps,
  ipcEndpointSecret,
} from '../src/ipc-endpoint-secret.js';

const originalFile = _ipcEndpointSecretOps.file;
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-transient-'));
  __resetIpcEndpointSecretForTests();
  fault.remaining = 0;
});
afterEach(() => {
  _ipcEndpointSecretOps.file = originalFile;
  __resetIpcEndpointSecretForTests();
  fault.remaining = 0;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('transient IPC secret reads', () => {
  for (const code of ['EMFILE', 'EBUSY']) {
    // A null here is the PUBLIC endpoint name for this call — and callers
    // memoize it (a daemon computes its endpoint once at start), so a blip
    // split the single-daemon election. A short transient is absorbed.
    it(`${code}: a short transient still yields the secret, not the public fallback`, () => {
      const file = path.join(root, 'secret');
      const secret = 'a'.repeat(64);
      fs.writeFileSync(file, secret);
      _ipcEndpointSecretOps.file = () => file;
      fault.code = code;
      fault.remaining = 2;
      expect(ipcEndpointSecret()).toBe(secret);
      expect(fs.readFileSync(file, 'utf8')).toBe(secret);
      expect(fs.readdirSync(root)).toEqual(['secret']);
    });

    it(`${code}: a failure outlasting the retries falls back without caching it`, () => {
      const file = path.join(root, 'secret');
      const secret = 'b'.repeat(64);
      fs.writeFileSync(file, secret);
      _ipcEndpointSecretOps.file = () => file;
      fault.code = code;
      fault.remaining = 1_000;
      expect(ipcEndpointSecret()).toBeNull();
      fault.remaining = 0;
      expect(ipcEndpointSecret()).toBe(secret);
      expect(fs.readFileSync(file, 'utf8')).toBe(secret);
    });
  }
});

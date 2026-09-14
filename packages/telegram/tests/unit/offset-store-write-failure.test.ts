import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const failures = vi.hoisted(() => ({ write: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeSync: (fd: number, data: string) => {
      if (failures.write) {
        throw Object.assign(new Error('write failed (simulated ENOSPC)'), { code: 'ENOSPC' });
      }
      return actual.writeSync(fd, data);
    },
  };
});

import { OffsetStore } from '../../src/offset-store.js';

let root: string;
let file: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'offset-write-failure-'));
  file = path.join(root, 'offset.json');
  failures.write = false;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('OffsetStore write cleanup', () => {
  it('removes the temporary file when the write itself fails', () => {
    failures.write = true;
    expect(() => new OffsetStore({ path: file }).write(7)).toThrow('write failed');
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('surfaces the write error and leaves the store empty', () => {
    failures.write = true;
    const store = new OffsetStore({ path: file });
    expect(() => store.write(7)).toThrowError(/ENOSPC/);
    expect(store.read()).toBeNull();
  });

  it('allows a subsequent write to succeed after a failed one', () => {
    failures.write = true;
    const store = new OffsetStore({ path: file });
    expect(() => store.write(7)).toThrow('write failed');
    failures.write = false;
    store.write(9);
    expect(store.read()).toBe(9);
    expect(fs.readdirSync(root)).toEqual(['offset.json']);
  });
});

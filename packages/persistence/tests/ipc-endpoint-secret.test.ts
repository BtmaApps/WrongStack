import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __createIpcEndpointSecretForTests,
  __resetIpcEndpointSecretForTests,
  _ipcEndpointSecretOps,
  ipcEndpointSecret,
  privateEndpointKey,
} from '../src/ipc-endpoint-secret.js';

/**
 * H-9 (security-check 2026-09-26): endpoint names were sha256(project path),
 * so another local user could compute a project's Windows pipe name and create
 * it first. The name now carries a per-OS-user secret.
 */
const realFile = _ipcEndpointSecretOps.file;
let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wst-ipc-secret-'));
  file = path.join(dir, 'nested', 'ipc-endpoint.secret');
  _ipcEndpointSecretOps.file = () => file;
  __resetIpcEndpointSecretForTests();
});

afterEach(() => {
  _ipcEndpointSecretOps.file = realFile;
  __resetIpcEndpointSecretForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

const publicKey = createHash('sha256').update('/work/app').digest('hex').slice(0, 24);

describe('privateEndpointKey', () => {
  it('is not computable from the project path, keeps the key shape, and is stable', () => {
    const key = privateEndpointKey(publicKey);
    expect(key).toMatch(/^[0-9a-f]{24}$/);
    expect(key).not.toBe(publicKey);
    __resetIpcEndpointSecretForTests();
    expect(privateEndpointKey(publicKey)).toBe(key); // re-read from disk
    expect(fs.readFileSync(file, 'utf8').trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for another user (another secret)', () => {
    const mine = privateEndpointKey(publicKey);
    fs.writeFileSync(file, `${'a'.repeat(64)}\n`);
    __resetIpcEndpointSecretForTests();
    expect(privateEndpointKey(publicKey)).not.toBe(mine);
  });

  it('keeps the previous naming when no secret can be had', () => {
    _ipcEndpointSecretOps.file = () => {
      throw new Error('no passwd entry');
    };
    __resetIpcEndpointSecretForTests();
    expect(ipcEndpointSecret()).toBeNull();
    expect(privateEndpointKey(publicKey)).toBe(publicKey);
  });

  it('ignores a malformed secret file rather than hashing garbage', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not-hex');
    expect(ipcEndpointSecret()).toBeNull();
  });

  // The invariant the secret must not break: every process of one user derives
  // the same name, or the single-owner election splits into two daemons. A
  // process that lost the create race must adopt the winner's secret.
  it('a losing creator adopts the existing secret instead of overwriting it', () => {
    const winner = 'b'.repeat(64);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${winner}\n`);
    expect(__createIpcEndpointSecretForTests(file)).toBe(winner);
    expect(fs.readFileSync(file, 'utf8').trim()).toBe(winner);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['ipc-endpoint.secret']);
  });

  // End-to-end smoke test across real processes. Process start-up staggers
  // them, so it rarely produces a true collision — the test above is the one
  // that pins the exclusive create.
  it('processes starting together all derive the same key', async () => {
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/ipc-endpoint-secret.ts')).href;
    const script = `
      const m = await import(${JSON.stringify(moduleUrl)});
      m._ipcEndpointSecretOps.file = () => ${JSON.stringify(file)};
      process.stdout.write(m.privateEndpointKey(${JSON.stringify(publicKey)}));
    `;
    const run = () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--experimental-strip-types', '--input-type=module', '-e', script],
          { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
        );
        let out = '';
        let err = '';
        child.stdout.on('data', (c) => {
          out += c;
        });
        child.stderr.on('data', (c) => {
          err += c;
        });
        child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err))));
      });
    const keys = await Promise.all(Array.from({ length: 8 }, run));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{24}$/);
    // No temp files left behind by the losers.
    expect(fs.readdirSync(path.dirname(file))).toEqual(['ipc-endpoint.secret']);
  }, 30_000);
});

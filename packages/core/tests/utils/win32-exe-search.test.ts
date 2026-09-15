/**
 * WS-2026-09-15-NV1 — bare executable names must not resolve from the cwd.
 *
 * The behavioural block runs only on win32, where the vulnerability exists, and
 * this repo is developed and CI-tested on Windows. It is self-validating: the
 * first case proves a planted binary IS picked up when the variable is absent
 * (so the fixture can detect the bug on this machine), and the second proves
 * the hardening stops it. Each probe runs in a fresh child `node` so the
 * parent's own environment — which libuv consults — is fully controlled.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildChildEnv } from '../../src/utils/child-env.js';
import {
  hardenWin32ExecutableSearch,
  NO_CWD_EXE_SEARCH_ENV,
} from '../../src/utils/win32-exe-search.js';

describe('hardenWin32ExecutableSearch', () => {
  it('is a no-op off Windows', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(hardenWin32ExecutableSearch(env, 'linux')).toBe(false);
    expect(env).toEqual({});
  });

  it('sets the variable on Windows and removes differently-cased copies', () => {
    const env: NodeJS.ProcessEnv = { NODEFAULTCURRENTDIRECTORYINEXEPATH: '' };
    expect(hardenWin32ExecutableSearch(env, 'win32')).toBe(true);
    expect(env).toEqual({ [NO_CWD_EXE_SEARCH_ENV]: '1' });
  });
});

describe.runIf(process.platform === 'win32')('win32 bare-name resolution (planted binary)', () => {
  let dir: string;
  const planted = `wsplant${process.pid}`;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ws-exe-search-'));
    // whoami.exe ships with every Windows install and has no side effects.
    copyFileSync(
      path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'whoami.exe'),
      path.join(dir, `${planted}.exe`),
    );
    writeFileSync(path.join(dir, `${planted}cmd.cmd`), '@echo PLANTED-CMD\r\n');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Spawn `name` from a child node whose OWN env is `parentEnv`, cwd = dir. */
  function probe(parentEnv: NodeJS.ProcessEnv, script: string): string {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: dir,
      env: parentEnv,
      encoding: 'utf8',
      windowsHide: true,
    });
    return `${result.stdout}`.trim();
  }

  function envWithout(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === NO_CWD_EXE_SEARCH_ENV.toLowerCase()) delete env[key];
    }
    return env;
  }

  const libuvScript = `const r=require('child_process').spawnSync(${JSON.stringify(planted)},[],{encoding:'utf8'});process.stdout.write(r.error?'ENOENT':'RAN')`;

  it('self-check: without the variable libuv runs the planted cwd binary', () => {
    expect(probe(envWithout(), libuvScript)).toBe('RAN');
  });

  it('with the variable in the spawning process, libuv refuses the cwd binary', () => {
    const env = envWithout();
    hardenWin32ExecutableSearch(env);
    expect(probe(env, libuvScript)).toBe('ENOENT');
  });

  it('cmd.exe `call` shims do not resolve the cwd copy once buildChildEnv is used', () => {
    const line = `call "${planted}cmd"`;
    const script = `const cp=require('child_process');const r=cp.spawnSync(process.env.COMSPEC,['/d','/c',${JSON.stringify(line)}],{encoding:'utf8',windowsVerbatimArguments:true,env:JSON.parse(process.argv[1])});process.stdout.write(r.stdout.includes('PLANTED-CMD')?'RAN':'REFUSED')`;
    const run = (childEnv: NodeJS.ProcessEnv): string => {
      const result = spawnSync(process.execPath, ['-e', script, JSON.stringify(childEnv)], {
        cwd: dir,
        env: envWithout(),
        encoding: 'utf8',
        windowsHide: true,
      });
      return `${result.stdout}`.trim();
    };
    // Self-check: a child env lacking the variable resolves the planted shim.
    expect(run(envWithout())).toBe('RAN');
    // buildChildEnv forces the variable, even though the parent env lacks it.
    const saved = process.env[NO_CWD_EXE_SEARCH_ENV];
    delete process.env[NO_CWD_EXE_SEARCH_ENV];
    try {
      expect(run(buildChildEnv())).toBe('REFUSED');
    } finally {
      if (saved !== undefined) process.env[NO_CWD_EXE_SEARCH_ENV] = saved;
    }
  });
});

/**
 * dep-guard parsed only the plain spellings of the managers it covers: python -m
 * pip, npm alias specs (npm:pkg), an env-assignment prefix, the .cmd/.exe shims
 * and npm's own install aliases installed unchecked.
 */
import { describe, expect, it } from 'vitest';
import { isTreeInstallCommand, parseInstallCommands } from '../src/dep-guard/install-commands.js';

const parsed = (command: string) =>
  parseInstallCommands(command).flatMap((p) =>
    p.packages.map((x) => `${p.manager}:${x.name}@${x.version ?? ''}`),
  );

describe('dep-guard: install spellings', () => {
  it('names the real package in every spelling, with manager and version', () => {
    expect(parsed('python -m pip install evilpkg==1.2')).toEqual(['pip:evilpkg@1.2']);
    expect(parsed('python3.12 -I -m pip install -r req.txt evilpkg')).toEqual(['pip:evilpkg@']);
    expect(parsed('py -3 -mpip install evilpkg')).toEqual(['pip:evilpkg@']);
    expect(parsed('npm install npm:evilpkg')).toEqual(['npm:evilpkg@']);
    expect(parsed('npm i safe@npm:evilpkg@1.0.0')).toEqual(['npm:evilpkg@1.0.0']);
    expect(parsed('pnpm add x@npm:@evil/pkg@2')).toEqual(['pnpm:@evil/pkg@2']);
    expect(parsed('NODE_ENV=production CI=1 npm i evilpkg')).toEqual(['npm:evilpkg@']);
    expect(parsed('npm.cmd install evilpkg')).toEqual(['npm:evilpkg@']);
    expect(parsed('pip.exe install evilpkg')).toEqual(['pip:evilpkg@']);
    expect(parsed('npm in evilpkg && npm isntall other')).toEqual(['npm:evilpkg@', 'npm:other@']);
  });

  it('leaves non-installs and existing behaviour alone', () => {
    expect(parsed('python -m pytest -k install')).toEqual([]);
    expect(parsed('python -m venv .venv')).toEqual([]);
    expect(parsed('npm run build')).toEqual([]);
    expect(parsed('npm info react')).toEqual([]);
    expect(parsed('FOO=1 npm test')).toEqual([]);
    expect(parsed('npm i react@18')).toEqual(['npm:react@18']);
    expect(parsed('npm i @scope/pkg@1')).toEqual(['npm:@scope/pkg@1']);
    expect(parsed('pnpm --filter app add lodash')).toEqual(['pnpm:lodash@']);
    expect(isTreeInstallCommand('NODE_ENV=x npm install')).toBe(true);
  });

  it('stays linear on hostile input', () => {
    for (const input of [
      'A=b '.repeat(4000) + 'npm i x',
      `python ${'-x '.repeat(4000)}`,
      `npm ${'-w a '.repeat(3000)}`,
    ]) {
      const t = performance.now();
      parseInstallCommands(input);
      expect(performance.now() - t, input.slice(0, 20)).toBeLessThan(500);
    }
  });
});

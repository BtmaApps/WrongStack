#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.js';
import { SERVER_INFO } from './version.js';

export * from './main.js';

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  const comparablePath = (value: string): string => {
    const normalized = path.resolve(value).replace(/^\\\\\?\\/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  if (comparablePath(entry) === comparablePath(self)) return true;
  try {
    return comparablePath(realpathSync(entry)) === comparablePath(realpathSync(self));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${SERVER_INFO.name}: unexpected error\n`);
      process.stderr.write(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.stderr.write('\n');
      process.exitCode = 1;
    },
  );
}

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { logsTool } from '../src/logs.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

let sandbox: Sandbox;
beforeEach(async () => {
  sandbox = await mkSandbox();
});
afterEach(async () => {
  await sandbox.cleanup();
});

async function readLine(message: string) {
  await writeFile(join(sandbox.dir, 'app.log'), message, 'utf8');
  return logsTool.execute({ path: 'app.log' }, sandbox.ctx, {
    signal: new AbortController().signal,
  });
}

describe('log levels require whole words, not suffixes of ordinary words', () => {
  it.each([
    'A terror happened',
    'running nodebug task',
    'received a prewarn event',
    'an xtrace line',
  ])('keeps an ordinary message at info: %s', async (message) => {
    const result = await readLine(message);
    expect(result.entries).toEqual([{ timestamp: '', level: 'info', message }]);
  });

  it.each([
    ['request failed: error timeout', 'error'],
    ['a WARN token appears', 'warn'],
    ['a DeBuG token appears', 'debug'],
    ['a TRACE token appears', 'trace'],
  ])('continues to recognize a standalone level in %s', async (message, level) => {
    const result = await readLine(message);
    expect(result.entries).toEqual([{ timestamp: '', level, message }]);
  });

  it('preserves the leading level and timestamp parsing branch', async () => {
    const result = await readLine('2026-10-11T00:00:00Z [WARN] low disk');
    expect(result.entries).toEqual([
      { timestamp: '2026-10-11T00:00:00Z', level: 'warn', message: 'low disk' },
    ]);
  });
});

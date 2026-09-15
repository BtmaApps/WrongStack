import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

describe('release-check matrix logging', () => {
  it('recreates the log directory and opens the file before each gate', () => {
    const runner = readFileSync(join(repoRoot, 'scripts', 'release-check-matrix.mjs'), 'utf8');
    const runGate = runner.slice(
      runner.indexOf('async function runGate'),
      runner.indexOf('const args'),
    );

    expect(runGate).toContain('mkdirSync(path.dirname(logFile), { recursive: true })');
    expect(runGate).toContain("fd: openSync(logFile, 'w')");
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import {
  announceSafeMode,
  isSafeMode,
  propagateSafeMode,
  SAFE_MODE_ENV,
} from '../src/boot/safe-mode.js';

describe('safe mode', () => {
  const original = process.env[SAFE_MODE_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[SAFE_MODE_ENV];
    else process.env[SAFE_MODE_ENV] = original;
  });

  it('parses --safe-mode as a boolean that keeps the prompt', () => {
    expect(parseArgs(['--safe-mode', 'task'])).toEqual({
      flags: { 'safe-mode': true },
      positional: ['task'],
    });
  });

  it('is on via the flag or the environment', () => {
    delete process.env[SAFE_MODE_ENV];
    expect(isSafeMode({})).toBe(false);
    expect(isSafeMode({ 'safe-mode': true })).toBe(true);
    process.env[SAFE_MODE_ENV] = '1';
    expect(isSafeMode({})).toBe(true);
  });

  it('announces once per process', () => {
    const lines: string[] = [];
    announceSafeMode({ 'safe-mode': true }, (l) => lines.push(l));
    announceSafeMode({ 'safe-mode': true }, (l) => lines.push(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Safe mode: .*are off\.\n$/);
  });

  it('exports the flag to child processes', () => {
    delete process.env[SAFE_MODE_ENV];
    expect(propagateSafeMode({})).toBe(false);
    expect(process.env[SAFE_MODE_ENV]).toBeUndefined();
    expect(propagateSafeMode({ 'safe-mode': true })).toBe(true);
    expect(process.env[SAFE_MODE_ENV]).toBe('1');
  });
});

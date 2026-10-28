import { expect, it } from 'vitest';
import { redactCommandArgs } from '../src/redact-command.js';
import { safeStringify, stripCodeFences } from '../src/safe-json.js';
import { truncate } from '../src/string.js';

it('redacts attached password values whole while preserving argument shape and normal flags', () => {
  for (const flag of ['-p', '-a', '-password', '-PASSWORD']) {
    for (const separator of ['', '=']) {
      for (const value of ['fixture private tail', 'fixture-with-dashes', 'fixture\nprivate']) {
        const args = [`${flag}${separator}${value}`, '--verbose', 'public space'];
        const before = [...args];
        const result = redactCommandArgs('tool', args);
        expect(result.args).toEqual([`${flag}${separator}[REDACTED]`, '--verbose', 'public space']);
        expect(args).toEqual(before);
        expect(redactCommandArgs('tool', result.args)).toEqual(result);
      }
    }
    expect(redactCommandArgs('tool', [flag]).args).toEqual([flag]);
    expect(redactCommandArgs('tool', [flag, '--verbose']).args).toEqual([flag, '--verbose']);
    expect(redactCommandArgs('tool', [flag, 'fixture private tail']).args).toEqual([
      flag,
      '[REDACTED]',
    ]);
  }
  expect(
    redactCommandArgs('curl', [
      '-t=sk-live-1234567890',
      '--user=admin:hunter two',
      '-u=admin:hunter two',
      '-uadmin:hunter two',
      '--cookie=sid=secret value',
    ]).args,
  ).toEqual([
    '-t=[REDACTED]',
    '--user=[REDACTED]',
    '-u=[REDACTED]',
    '-u[REDACTED]',
    '--cookie=[REDACTED]',
  ]);
  expect(redactCommandArgs('sudo', ['-u', 'root', '--color=always']).args).toEqual([
    '-u',
    'root',
    '--color=always',
  ]);
  expect(redactCommandArgs('tool', []).args).toEqual([]);
});

it('handles surrogate pairs in truncate and trailing prose / single-line fences in stripCodeFences (F46)', () => {
  expect(truncate('a😀b', 3)).toBe('a…');
  expect(truncate('abcdef', 0)).toBe('');
  expect(truncate('abcdef', 1)).toBe('…');
  expect(stripCodeFences('```json\n{"ok": true}\n```\nHope this helps!')).toBe('{"ok": true}');
  expect(stripCodeFences('Result: ```json {"ok": true} ```')).toBe('{"ok": true}');
});

it('detects circular .toJSON() objects in safeStringify and redacts whole env-style/comma argv secrets in redactCommandArgs (F851, F852)', () => {
  const cyclicToJson: Record<string, unknown> = {
    id: 'n1',
    toJSON() {
      return { id: 'n1', self: cyclicToJson };
    },
  };
  const parsed = JSON.parse(safeStringify(cyclicToJson));
  expect(parsed).toEqual({ id: 'n1', self: '[Circular]' });

  const redacted = redactCommandArgs('env', [
    'PASSWORD=hunter two',
    'API_KEY=part1,part2',
    'MY_AUTH_TOKEN=alpha beta',
    '--token,secret tail',
  ]);
  expect(redacted.args).toEqual([
    'PASSWORD=[REDACTED]',
    'API_KEY=[REDACTED]',
    'MY_AUTH_TOKEN=[REDACTED]',
    '--token,[REDACTED]',
  ]);
});

import { expect, it } from 'vitest';
import { redactCommandArgs } from '../src/redact-command.js';

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
  expect(redactCommandArgs('sudo', ['-u', 'root', '--color=always']).args).toEqual([
    '-u',
    'root',
    '--color=always',
  ]);
  expect(redactCommandArgs('tool', []).args).toEqual([]);
});

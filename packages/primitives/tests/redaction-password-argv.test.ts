import { describe, expect, it } from 'vitest';
import { redactCommandArgs } from '../src/redact-command.js';

describe('single-dash password argv redaction', () => {
  it.each(['-password', '-PASSWORD', '-Password'])(
    'redacts the separate value after %s',
    (flag) => {
      const value = ['fixture', 'value'].join('');
      expect(redactCommandArgs('tool', [flag, value, 'public']).args).toEqual([
        flag,
        '[REDACTED]',
        'public',
      ]);
    },
  );

  it('keeps a bare password flag intact when it has no value', () => {
    expect(redactCommandArgs('tool', ['-password']).args).toEqual(['-password']);
  });

  it('does not consume a following option as a value', () => {
    expect(redactCommandArgs('tool', ['-password', '--verbose']).args).toEqual([
      '-password',
      '--verbose',
    ]);
  });

  it.each(['--password', '-p', '-a', '-t'])('preserves existing pair handling for %s', (flag) => {
    expect(redactCommandArgs('tool', [flag, 'value with spaces']).args).toEqual([
      flag,
      '[REDACTED]',
    ]);
  });

  it('preserves attached password redaction and argv shape', () => {
    const value = ['fixture', 'value'].join('');
    const result = redactCommandArgs('tool', [`-password=${value}`, 'public']);
    expect(result.args).toEqual(['-password=[REDACTED]', 'public']);
  });

  it('preserves uppercase -PASSWORD= and attached -password<value> in redactCommand and redactSecrets', async () => {
    const { redactCommand, redactSecrets } = await import('../src/redact-command.js');
    const value = ['hunter', '2'].join('');
    expect(redactCommand(`tool -PASSWORD=${value}`)).toBe('tool -PASSWORD=[REDACTED]');
    expect(redactSecrets(`tool -PASSWORD=${value}`)).toBe('tool -PASSWORD=[REDACTED]');
    expect(redactCommand(`tool -password${value}`)).toBe('tool -password[REDACTED]');
  });
});

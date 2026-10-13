import { describe, expect, it } from 'vitest';
import {
  isSystemSessionId,
  requireSessionId,
  SESSION_ID_REQUIRED,
  SessionIdRequiredError,
  systemSessionId,
} from '../src/session-id.js';

describe('session-id primitives', () => {
  it('requires an explicit non-blank session id', () => {
    expect.assertions(3);
    expect(requireSessionId('sess_1', 'run')).toBe('sess_1');
    expect(() => requireSessionId(' ', 'run')).toThrow(SessionIdRequiredError);
    try {
      requireSessionId(null, 'run');
    } catch (error) {
      expect(error).toMatchObject({ code: SESSION_ID_REQUIRED });
    }
  });

  it('marks daemon-owned system session ids', () => {
    expect(systemSessionId('kanban')).toBe('system:kanban');
    expect(systemSessionId('  kanban  ')).toBe('system:kanban');
    expect(isSystemSessionId('system:kanban')).toBe(true);
    expect(isSystemSessionId('system:   ')).toBe(false);
    expect(isSystemSessionId('sess_1')).toBe(false);
  });

  it('redacts sensitive command flags and credentials without redacting adjacent flags or plain usernames', async () => {
    const { redactCommand, redactCommandArgs } = await import('../src/redact-command.js');
    expect(
      redactCommandArgs('curl', ['--token', '--verbose', '-u', 'alice', '-u', 'alice:supersecret']),
    ).toEqual({
      command: 'curl',
      args: ['--token', '--verbose', '-u', 'alice', '-u', '[REDACTED]'],
    });
    expect(redactCommand('cli --password my-secret-value')).toBe('cli --password [REDACTED]');
  });
});

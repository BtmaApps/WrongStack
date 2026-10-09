/**
 * Regression: curl-style basic-auth credentials (`-u user:pass`,
 * `--user user:pass`, `--proxy-user user:pass`, glued `-uuser:pass`, argv
 * pair `["-u", "user:pass"]`) reached `/ps` output, telemetry and Telegram
 * notifications verbatim, while the same credential as an `Authorization`
 * header was redacted. A bare user name (`sudo -u root`) must stay readable.
 */
import { describe, expect, it } from 'vitest';
import { redactCommand, redactCommandArgs, redactSecrets } from '../src/redact-command.js';

const SECRET = 's3cr3tP4ssw0rd';

describe('curl-style user:pass credentials', () => {
  it.each([
    `curl -u admin:${SECRET} https://x`,
    `curl --user admin:${SECRET} https://x`,
    `curl --user=admin:${SECRET} https://x`,
    `curl -uadmin:${SECRET} https://x`,
    `curl --proxy-user admin:${SECRET} https://x`,
    `curl -u "admin:${SECRET}" https://x`,
  ])('redacts %s on both profiles', (cmd) => {
    expect(redactCommand(cmd)).not.toContain(SECRET);
    expect(redactSecrets(cmd)).not.toContain(SECRET);
  });

  it('keeps the flag and the rest of the line readable', () => {
    expect(redactCommand(`curl -u admin:${SECRET} https://x`)).toBe('curl -u [REDACTED] https://x');
    expect(redactCommand(`curl --user=admin:${SECRET} https://x`)).toBe(
      'curl --user=[REDACTED] https://x',
    );
  });

  it.each([
    'sudo -u root ls',
    'ps -u alice',
    'curl --user-agent "Mozilla/5.0 (X11: Linux)" https://x',
  ])('leaves %s unchanged', (cmd) => {
    expect(redactCommand(cmd)).toBe(cmd);
  });

  it('redacts the argv pair form only when the value is user:pass', () => {
    expect(redactCommandArgs('curl', ['-u', `admin:${SECRET}`, 'https://x']).args).toEqual([
      '-u',
      '[REDACTED]',
      'https://x',
    ]);
    expect(redactCommandArgs('sudo', ['-u', 'root', 'ls']).args).toEqual(['-u', 'root', 'ls']);
  });
});

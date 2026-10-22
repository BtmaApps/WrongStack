/**
 * Regression (F523): a session cookie — the `Cookie:` header or curl's
 * `--cookie` — reached `/ps` output, telemetry and Telegram notifications
 * verbatim while the same credential as an `Authorization` header was
 * redacted. `--cookie-jar <file>` names a file and must stay readable.
 */
import { describe, expect, it } from 'vitest';
import { redactCommand, redactCommandArgs, redactSecrets } from '../src/redact-command.js';

const SID = 'sess_9f8e7d6c5b4a39281706';

describe('cookie credentials', () => {
  it.each([
    [
      `curl -H "Cookie: theme=dark; session=${SID}" https://x`,
      'curl -H "Cookie:[REDACTED]" https://x',
    ],
    [`curl --cookie "session=${SID}" https://x`, 'curl --cookie [REDACTED] https://x'],
    [`curl --cookie=session=${SID} https://x`, 'curl --cookie=[REDACTED] https://x'],
  ])('redacts %s on both profiles', (input, expected) => {
    expect(redactCommand(input)).toBe(expected);
    expect(redactSecrets(input)).not.toContain(SID);
  });

  it('redacts a quoted Cookie header value across command, outbound, and argv profiles', () => {
    const secret = 'session-secret-9f87';
    const header = `Cookie: session="${secret}"; theme=dark`;
    const line = `curl -H '${header}' https://x`;
    expect(redactCommand(line)).toBe("curl -H 'Cookie:[REDACTED]' https://x");
    expect(redactSecrets(line)).not.toContain(secret);
    expect(redactCommandArgs('curl', ['-H', header]).args).toEqual(['-H', 'Cookie:[REDACTED]']);
  });

  it('leaves --cookie-jar and unrelated words readable', () => {
    for (const line of ['curl --cookie-jar /tmp/jar.txt https://x', 'git checkout -b cookie-fix']) {
      expect(redactCommand(line)).toBe(line);
      expect(redactSecrets(line)).toBe(line);
    }
  });
});

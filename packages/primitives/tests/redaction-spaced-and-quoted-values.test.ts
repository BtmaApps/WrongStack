/**
 * Regressions in the canonical redactor:
 *
 * - The OUTBOUND (Telegram) env-style pattern required the value right after
 *   `=`/`:`, so `PASSWORD: hunter2` and `PASSWORD = hunter2` reached the phone
 *   verbatim — the core scrubber does not classify a short labelled value, and
 *   the COMMAND profile (`/ps`) already allowed the surrounding whitespace.
 * - Both profiles took a flag's value up to the next space, so a quoted secret
 *   containing a space printed its tail: `--password="hunter two"` became
 *   `--password=[REDACTED] two"`.
 */
import { describe, expect, it } from 'vitest';
import { redactCommand, redactSecrets } from '../src/redact-command.js';

describe('outbound env-style label with spaced separator', () => {
  it.each([
    ['PASSWORD: hunter2hunter2', 'PASSWORD:[REDACTED]'],
    ['PASSWORD = hunter2hunter2', 'PASSWORD [REDACTED]'],
    ['export DB_PASSWORD= hunter2hunter2', 'export DB_PASSWORD=[REDACTED]'],
    ['TOKEN=abc123 node app.js', 'TOKEN=[REDACTED] node app.js'],
  ])('%s', (input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });
});

describe('quoted secret values containing a space', () => {
  it.each([
    ['mysql --password="hunter two" -u root', 'mysql --password=[REDACTED] -u root'],
    ["mysql --password 'hunter two' -u root", 'mysql --password [REDACTED] -u root'],
    ['PASSWORD="correct horse battery" ./run', 'PASSWORD=[REDACTED] ./run'],
    ["deploy --db-password='a b c'", 'deploy --db-password=[REDACTED]'],
    // Short flags take the quoted value whole too.
    ['mysql -p "hunter two" db', 'mysql -p [REDACTED] db'],
    ["redis-cli -a 'correct horse' ping", 'redis-cli -a [REDACTED] ping'],
    ['tool -password "a b c" run', 'tool -password [REDACTED] run'],
  ])('%s', (input, expected) => {
    expect(redactCommand(input)).toBe(expected);
    expect(redactSecrets(input)).toBe(expected);
  });

  it('falls back to the bare token for an unclosed quote and never crosses a newline', () => {
    expect(redactCommand('x --password="abc tail')).toBe('x --password=[REDACTED] tail');
    expect(redactCommand('x --password="abc\nnext "line"')).toBe(
      'x --password=[REDACTED]\nnext "line"',
    );
  });

  it('leaves quoted non-secret flags alone and stays idempotent', () => {
    const benign = 'deploy --dry-run --color="always on"';
    expect(redactSecrets(benign)).toBe(benign);
    const once = redactSecrets('x --token="a b" PASSWORD: pw1234');
    expect(redactSecrets(once)).toBe(once);
  });
});

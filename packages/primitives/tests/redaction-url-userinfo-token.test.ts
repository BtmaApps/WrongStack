/**
 * Regression (F522): a token used ALONE as URL userinfo — `git clone
 * https://ghp_…@github.com/…`, GitLab `glpat-…` — has no `user:password` shape,
 * so it reached `/ps` output, telemetry and Telegram notifications verbatim. A
 * plain user name (`alice@`) must stay readable.
 */
import { describe, expect, it } from 'vitest';
import { redactCommand, redactCommandArgs, redactSecrets } from '../src/redact-command.js';

const PAT = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
const tokens = [PAT, 'glpat-AbCdEfGhIjKlMnOpQrSt', `github_pat_${'A1'.repeat(20)}`, 'x'.repeat(32)];
const clone = (userinfo: string) => `git clone https://${userinfo}@github.com/o/r.git`;

describe('token-only URL userinfo', () => {
  it.each(tokens)('redacts %s on both profiles', (token) => {
    expect(redactCommand(clone(token))).toBe('git clone https://[REDACTED]@github.com/o/r.git');
    expect(redactSecrets(clone(token))).not.toContain(token);
  });

  it('redacts the token in an argv entry', () => {
    const { args } = redactCommandArgs('git', ['clone', `https://${PAT}@github.com/o/r.git`]);
    expect(args.join(' ')).not.toContain(PAT);
  });

  it('keeps a user name readable', () => {
    expect(redactCommand(clone('alice'))).toBe(clone('alice'));
    expect(redactCommand(clone('y'.repeat(31)))).toBe(clone('y'.repeat(31)));
  });
});

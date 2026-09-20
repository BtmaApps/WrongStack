import { describe, expect, it } from 'vitest';
import { redactCommand } from '../src/process-registry.js';

/**
 * P2 #13 (before-release.md): redactCommand() applies 5 regex patterns to
 * redact credentials from displayed command lines (TUI status bar, /ps output,
 * crash dumps). These patterns are security-critical: false negatives leak
 * secrets to the TUI and log files; false positives make legitimate commands
 * unreadable. Neither case was tested.
 *
 * These tests pin both directions — secrets are redacted, non-secrets are
 * left intact — across every SENSITIVE_FLAG_PATTERNS regex path.
 */
describe('redactCommand — secret redaction (P2 #13)', () => {
  describe('env-var-style secrets (TOKEN=x, API_KEY=y)', () => {
    it.each([
      ['export API_KEY=sk-abc123', /API_KEY=\[REDACTED\]/],
      ['export TOKEN=ghp_xxxxx', /TOKEN=\[REDACTED\]/],
      ['export GITHUB_TOKEN=ghp_xxxxx', /GITHUB_TOKEN=\[REDACTED\]/],
      ['export GH_TOKEN=ghp_xxxxx', /GH_TOKEN=\[REDACTED\]/],
      ['export SECRET=mypassword', /SECRET=\[REDACTED\]/],
      ['export PASSWORD=hunter2', /PASSWORD=\[REDACTED\]/],
      ['export JWT=eyJhbGci', /JWT=\[REDACTED\]/],
      ['export BEARER=abc123', /BEARER=\[REDACTED\]/],
      ['API_KEY=sk-abc123 npm start', /API_KEY=\[REDACTED\]/],
      // space-separated (export VAR value) — the `=` form is the primary;
      // space-separated may or may not redact depending on the regex. We
      // assert the `=` form is covered and do not over-claim the space form.
    ])('redacts %j', (cmd, pattern) => {
      expect(redactCommand(cmd)).toMatch(pattern);
    });
  });

  describe('long flags (--token=value, --github-token=...)', () => {
    it.each([
      ['npm install --token=abc123', /--token=\[REDACTED\]/],
      ['npm install --api-key=sk-abc123', /--api-key=\[REDACTED\]/],
      ['npm install --api_key=sk-abc123', /--api_key=\[REDACTED\]/],
      ['git clone --github-token=ghp_xxxxx', /--github-token=\[REDACTED\]/],
      ['git clone --gh-token=ghp_xxxxx', /--gh-token=\[REDACTED\]/],
      ['curl --password=hunter2 https://example.com', /--password=\[REDACTED\]/],
      ['curl --secret=mypassword https://example.com', /--secret=\[REDACTED\]/],
      ['curl --auth=bearer123 https://example.com', /--auth=\[REDACTED\]/],
      ['curl --credential=user:pass https://example.com', /--credential=\[REDACTED\]/],
      ['curl --private-key=-----BEGIN https://example.com', /--private-key=\[REDACTED\]/],
      ['curl --access-key=AKIAIOSF https://example.com', /--access-key=\[REDACTED\]/],
      ['curl --access_token=abc https://example.com', /--access_token=\[REDACTED\]/],
    ])('redacts %j', (cmd, pattern) => {
      expect(redactCommand(cmd)).toMatch(pattern);
    });
  });

  describe('short flags (-t value, -p value)', () => {
    it.each([
      // -t values must be token-like (>= 8 chars) so `tar -tf` style
      // combined flags are not eaten — see the false-positive guard below.
      ['curl -t abc12345 https://example.com', /-t\s+\[REDACTED\]/],
      ['curl -t=abc12345 https://example.com', /-t=\[REDACTED\]/],
      // Note: `-password hunter2` is partially redacted — the regex matches
      // `-p` + optional `ssword` + whitespace + value, so it consumes the
      // value but the `ssword` tail survives as `-p[REDACTED]ssword`-style
      // output. This is a known heuristic imprecision (the `-p(?:ssword)?`
      // alternation), not a regression. We assert the value is redacted
      // (hunter2 does not leak) without asserting the exact flag shape.
      // The env-var regex (#3) catches `PASSWORD=hunter2` cleanly, so the
      // export form is the reliable coverage path for password secrets.
    ])('redacts %j', (cmd, pattern) => {
      expect(redactCommand(cmd)).toMatch(pattern);
    });

    it('does not leak the value of -password hunter2', () => {
      const out = redactCommand('curl -password hunter2 https://example.com');
      expect(out).not.toMatch(/hunter2/);
    });
  });

  describe('high-entropy base64 after a secret-flag name', () => {
    it.each([
      [
        '--github-token=EyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIi',
        /--github-token=\[REDACTED\]/,
      ],
      ['--api-key=SkRmOQzN3a8qP4xY7vW2bH1cU6tZ0sL9', /--api-key=\[REDACTED\]/],
    ])('redacts %j', (cmd, pattern) => {
      expect(redactCommand(cmd)).toMatch(pattern);
    });
  });

  describe('non-secrets are left intact (false-positive guard)', () => {
    it.each([
      ['echo hello', 'echo hello'],
      ['npm install', 'npm install'],
      ['pnpm build', 'pnpm build'],
      ['node index.js', 'node index.js'],
      ['ls -la', 'ls -la'],
      ['git status', 'git status'],
      ['cat /home/user/token.txt', 'cat /home/user/token.txt'],
      // token.txt is a filename, not a --token=value flag — must NOT redact.
      // Combined short flags where `t` is a mode letter, not a token flag:
      // the -t pattern requires a token-like value (>= 8 chars), so these
      // everyday invocations survive intact.
      ['tar -tf archive.tar', 'tar -tf archive.tar'],
      ['ssh -tt host uptime', 'ssh -tt host uptime'],
    ])('leaves %j unchanged', (cmd, expected) => {
      expect(redactCommand(cmd)).toBe(expected);
    });
  });

  describe('idempotency', () => {
    it('redacting an already-redacted command is stable', () => {
      const once = redactCommand('export TOKEN=secret123');
      const twice = redactCommand(once);
      expect(twice).toBe(once);
    });

    it('redacting a command with no secrets returns the same string', () => {
      const cmd = 'npm install lodash';
      expect(redactCommand(cmd)).toBe(cmd);
    });
  });

  describe('multiple secrets in one command', () => {
    it('redacts every secret, not just the first', () => {
      const cmd = 'export API_KEY=sk-abc TOKEN=ghp_xyz --password=hunter2';
      const redacted = redactCommand(cmd);
      expect(redacted).toMatch(/API_KEY=\[REDACTED\]/);
      expect(redacted).toMatch(/TOKEN=\[REDACTED\]/);
      expect(redacted).toMatch(/--password=\[REDACTED\]/);
      // No raw secrets leak through.
      expect(redacted).not.toMatch(/sk-abc/);
      expect(redacted).not.toMatch(/ghp_xyz/);
      expect(redacted).not.toMatch(/hunter2/);
    });

    it('redacts EVERY -t occurrence, not just the first (g flag)', () => {
      const out = redactCommand('tool -t firsttoken123 && tool2 -t secondtoken456');
      expect(out).not.toContain('firsttoken123');
      expect(out).not.toContain('secondtoken456');
    });

    it('redacts EVERY high-entropy secret flag, not just the first (g flag)', () => {
      // Flags that hit ONLY the generic high-entropy pattern (not the named
      // long-flag pattern): bare "key" is not in the named list.
      const a = 'A1b2C3d4'.repeat(5); // 40 chars, base64-ish
      const b = 'Z9y8X7w6'.repeat(5);
      const out = redactCommand(`deploy --sshkey=${a} --deploykey=${b}`);
      expect(out).not.toContain(a);
      expect(out).not.toContain(b);
      expect(out).toMatch(/--sshkey=\[REDACTED\]/);
      expect(out).toMatch(/--deploykey=\[REDACTED\]/);
    });
  });

  /**
   * Regression: the flag/value separator must be the first character AFTER THE
   * FLAG NAME, not a delimiter picked by precedence.
   *
   * The callback used to choose `=` → `:` → whitespace in that order, so a
   * colon INSIDE a space-separated value was mistaken for the separator and the
   * value's prefix was printed verbatim — `redis-cli -a hunter2:pw` rendered as
   * `-a hunter2:[REDACTED]`, leaking the password's first half into /ps output,
   * crash dumps and telemetry that consume redactCommand.
   */
  describe('separator must follow the flag name, not a colon inside the value', () => {
    it.each([
      ['redis-cli -a hunter2:s3cr3tv@lue SET k v', 'hunter2', /-a \[REDACTED\]/],
      ['curl --auth bearer123:xyz https://example.com', 'bearer123', /--auth \[REDACTED\]/],
      ['mysql --password "hunter2:3306" -h db', 'hunter2', /--password \[REDACTED\]/],
      ['probe --api-key sk-abc123:deadbeef', 'sk-abc123', /--api-key \[REDACTED\]/],
    ])('does not leak the value prefix of %j', (cmd, secret, pattern) => {
      const out = redactCommand(cmd);
      expect(out).not.toContain(secret);
      expect(out).toMatch(pattern);
    });

    it.each([
      // Glued short forms: no separator exists at all, so the whole tail after
      // the 2-char flag is the value and must be redacted.
      ['redis-cli -apass:word PING', 'pass'],
      ['probe -tsecret:token123', 'secret'],
    ])('redacts the whole glued value of %j', (cmd, secret) => {
      expect(redactCommand(cmd)).not.toContain(secret);
    });

    it('keeps the colon form it was introduced for', () => {
      expect(redactCommand('run TOKEN:abc123def')).toBe('run TOKEN:[REDACTED]');
      expect(redactCommand('run API_KEY:sk-abc123')).toBe('run API_KEY:[REDACTED]');
    });

    it('keeps the existing renders for equals and space separated forms', () => {
      expect(redactCommand('curl --password=hunter2 x')).toBe('curl --password=[REDACTED] x');
      expect(redactCommand('curl -t abc12345 https://example.com')).toBe(
        'curl -t [REDACTED] https://example.com',
      );
      expect(redactCommand('curl -password hunter2 https://example.com')).toBe(
        'curl -password [REDACTED] https://example.com',
      );
    });

    it('still leaves a bare long flag untouched (no value to redact)', () => {
      expect(redactCommand('tool --token')).toBe('tool --token');
    });
  });

  /**
   * Regression: `,` is a separator the pattern list already declares —
   * `(?:[=\s,][^\s]*)?` for named long flags and `[=\s,][A-Za-z0-9+/=]{32,}`
   * for the high-entropy rule — but the callback only accepted '=', ':' and
   * whitespace. A comma-separated value therefore reached the "no separator"
   * branch, and for a `--flag` match that branch returns the match unchanged,
   * so the secret was emitted verbatim.
   */
  describe('comma-separated values are redacted (pattern-declared separator)', () => {
    const HIGH_ENTROPY = 'SkRmOQzN3a8qP4xY7vW2bH1cU6tZ0sL9';

    it.each([
      ['deploy --token,abc123def --dry-run', 'abc123def', '--token,[REDACTED]'],
      ['probe --api-key,sk-abc123', 'sk-abc123', '--api-key,[REDACTED]'],
      ['mysql --password,hunter2 db', 'hunter2', '--password,[REDACTED]'],
    ])('redacts the value of %j', (cmd, secret, expected) => {
      const out = redactCommand(cmd);
      expect(out).not.toContain(secret);
      expect(out).toContain(expected);
    });

    it('redacts a comma-separated high-entropy secret (pattern 5)', () => {
      const out = redactCommand(`deploy --github-token,${HIGH_ENTROPY} --verbose`);
      expect(out).not.toContain(HIGH_ENTROPY);
      expect(out).toContain('--github-token,[REDACTED]');
    });

    it('stays idempotent for the comma form', () => {
      const once = redactCommand('deploy --token,abc123def --dry-run');
      expect(redactCommand(once)).toBe(once);
    });
  });
});

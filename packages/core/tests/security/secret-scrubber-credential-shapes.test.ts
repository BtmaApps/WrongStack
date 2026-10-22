/**
 * Credential shapes the scrubber used to pass through verbatim:
 *
 * - `~/.aws/credentials` spells `aws_secret_access_key` in lowercase, and
 *   `high_entropy_env` only accepts UPPERCASE key names;
 * - a token in a URL's userinfo (`https://user:TOKEN@github.com`) had no
 *   pattern unless the scheme was one of the database URIs;
 * - an Azure `AccountKey=` / `SharedAccessKey=` connection string;
 * - a dotted env value (Discord `a.b.c`) — `.` was not in the value class, so
 *   the match stopped short of the boundary and nothing was redacted.
 *
 * Placeholders in a URL (`${TOKEN}`, `<pass>`, `password`, `***`) are not
 * credentials: redacting them rewrites scripts the model reads back.
 */
import { describe, expect, it } from 'vitest';
import { DefaultSecretScrubber } from '../../src/security/secret-scrubber.js';

const scrubber = new DefaultSecretScrubber();
const KEY40 = 'wJalrXUtnFEMIK7MDENGbPxRfiCYzEXAMPLEKEY1';
const TOKEN = 'ghTk9fQ2xLmPz81Rw';

describe('DefaultSecretScrubber — credential shapes', () => {
  it('redacts a lowercase aws_secret_access_key', () => {
    expect(scrubber.scrub(`aws_secret_access_key = ${KEY40}`)).toBe('[REDACTED:aws_secret_key]');
    expect(scrubber.scrub(`aws_secret_access_key=${KEY40}x`)).toContain(KEY40);
  });

  // F465: the documented CLI form separates the name and the key with a space.
  it('redacts the aws configure set form', () => {
    expect(scrubber.scrub(`aws configure set aws_secret_access_key ${KEY40}`)).toBe(
      'aws configure set [REDACTED:aws_secret_key]',
    );
    expect(scrubber.scrub('aws_secret_access_key is required')).toBe(
      'aws_secret_access_key is required',
    );
  });

  it('redacts only the password of a URL userinfo', () => {
    expect(scrubber.scrub(`git clone https://user:${TOKEN}@github.com/o/r.git`)).toBe(
      'git clone https://user:[REDACTED:url_credentials]@github.com/o/r.git',
    );
    expect(scrubber.scrub(`a https://u:${TOKEN}@h1 b http://:${TOKEN}@proxy:3128`)).toBe(
      'a https://u:[REDACTED:url_credentials]@h1 b http://:[REDACTED:url_credentials]@proxy:3128',
    );
  });

  it('leaves database URIs to their whole-URI patterns', () => {
    expect(scrubber.scrub(`postgres://app:${TOKEN}@db:5432/x`)).toBe('[REDACTED:postgres_uri]');
  });

  it('leaves URL placeholders and credential-free URLs intact', () => {
    for (const text of [
      'https://example.com:8080/path?q=1',
      'git push "https://x-access-token:${GITHUB_TOKEN}@github.com/o/r"',
      'https://user:<password>@host',
      'https://user:{{secret}}@host',
      'scheme://user:password@host',
      'scheme://user:***@host',
      'see https://github.com/@scope/pkg and user@host',
    ]) {
      expect(scrubber.scrub(text)).toBe(text);
    }
  });

  it('redacts an Azure connection-string key', () => {
    const key = `${KEY40}${KEY40}abcdef==`;
    expect(scrubber.scrub(`AccountName=a;AccountKey=${key};EndpointSuffix=x`)).toBe(
      'AccountName=a;[REDACTED:azure_storage_key];EndpointSuffix=x',
    );
    expect(scrubber.scrub('AccountKey=short')).toBe('AccountKey=short');
  });

  it('redacts a dotted env token whole', () => {
    // Assembled at runtime so no bot-token-shaped literal sits in the repo
    // (GitHub push protection flags it even as a synthetic fixture).
    const token = ['MTAxNzY4OTIzNDU2Nzg5MDEy', 'GaBcDe', 'x9Yz8Wv7Ut6Sr5Qp4On3Ml2Kj1Ih0Gf'].join(
      '.',
    );
    expect(scrubber.scrub(`DISCORD_TOKEN=${token}`)).toBe(
      'DISCORD_TOKEN=[REDACTED:high_entropy_env]',
    );
  });

  // F464: a Stripe restricted key and a PyPI upload token went out verbatim.
  it('redacts Stripe restricted keys and PyPI tokens', () => {
    const body = 'Zq7xK2mPa9LrT4vNb8Wc3Yd6Fh1Jk5Qs';
    expect(scrubber.scrub(`key rk_live_${body} end`)).toBe('key [REDACTED:stripe_key] end');
    expect(scrubber.scrub(`rk_test_${body}`)).toBe('[REDACTED:stripe_key]');
    expect(scrubber.scrub(`twine -p pypi-AgEIcHlwaS5vcmc${body}${body} upload`)).toBe(
      'twine -p [REDACTED:pypi_token] upload',
    );
    expect(scrubber.scrub('pip install pypi-package-name')).toBe('pip install pypi-package-name');
    expect(scrubber.scrub(`rk_live_${'a'.repeat(23)}`)).toBe(`rk_live_${'a'.repeat(23)}`);
  });

  it('redacts a Basic Authorization header (F524) but not the word "basic"', () => {
    const b64 = Buffer.from('deploy:hunter2-Pr0d!').toString('base64');
    expect(scrubber.scrub(`> Authorization: Basic ${b64}`)).toBe('> [REDACTED:basic_auth]');
    expect(scrubber.scrub(`authorization: basic ${b64}`)).not.toContain(b64);
    for (const text of [
      'Use basic authentication for the admin panel',
      'WWW-Authenticate: Basic realm="internal"',
    ]) {
      expect(scrubber.scrub(text)).toBe(text);
    }
  });
});

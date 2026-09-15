import { describe, expect, it } from 'vitest';
import { guardedFetch } from '../src/_fetch-guard.js';

// Runs with the default guard (private targets and plain http refused).
delete process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'];

describe('guardedFetch refusal messages', () => {
  it('does not call the caller-supplied URL a redirect', async () => {
    // read_url_content reported "redirect to http:// blocked" for a URL the
    // model typed directly — there was no redirect to look for.
    const refusal = guardedFetch('http://example.com/', 5, new AbortController().signal);
    await expect(refusal).rejects.toThrow('fetch: http:// blocked (HTTPS required by default)');
    await expect(refusal).rejects.not.toThrow(/redirect/);
  });

  it('names the protocol of the caller-supplied URL without "redirect"', async () => {
    const refusal = guardedFetch('ftp://example.com/', 5, new AbortController().signal);
    await expect(refusal).rejects.toThrow('fetch: unsupported protocol "ftp:"');
  });
});

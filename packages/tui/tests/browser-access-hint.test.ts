import { describe, expect, it } from 'vitest';
import { browserAccessHint } from '../src/browser-access-hint.js';

describe('browser access guidance', () => {
  it.each(['fetch', 'read_url_content'])('shows shared network guidance for %s', (tool) => {
    expect(
      browserAccessHint(
        tool,
        false,
        'fetch: http:// blocked (HTTPS required by default). For a trusted development origin, run /network allow http://localhost:3000',
      ),
    ).toContain('/network allow http://localhost:3000');
  });
  it.each(['http://localhost:3000', 'http://127.0.0.1:4173', 'http://[::1]:3000'])(
    'shows the exact operator command for %s',
    (origin) => {
      expect(
        browserAccessHint(
          'browser_open',
          false,
          `browser: blocked localhost target. Allow this project origin with /browser allow ${origin}`,
        ),
      ).toContain(`/browser allow ${origin}`);
    },
  );
  it('only suggests allowances for browser policy refusals with a valid origin', () => {
    expect(
      browserAccessHint('browser_open', true, 'browser: blocked /browser allow http://localhost:3'),
    ).toBeUndefined();
    expect(
      browserAccessHint('fetch', false, 'browser: blocked /browser allow http://localhost:3'),
    ).toBeUndefined();
    expect(
      browserAccessHint(
        'browser_open',
        false,
        'Chromium missing /browser allow http://localhost:3',
      ),
    ).toBeUndefined();
    expect(
      browserAccessHint(
        'browser_open',
        false,
        'browser: blocked /browser allow http://user:pass@localhost:3',
      ),
    ).toBeUndefined();
    expect(
      browserAccessHint(
        'browser_open',
        false,
        'browser: blocked /browser allow http://localhost:3/private',
      ),
    ).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROVIDER_AUTH_STRATEGIES } from '../src/oauth/builtin-strategies.js';

/**
 * The WebUI prefers its own localized `settings:oauth.guidance.<id>` copy and
 * falls back to the strategy's registry `notes`. The English catalog entry IS
 * the same sentence as the fallback, so the two must stay byte-identical —
 * otherwise a WebUI user and a TUI user see different wording for one login.
 *
 * Lives here (not in webui/tests) on purpose: importing `@wrongstack/providers`
 * from the webui suite would resolve through package exports to `dist/`, adding
 * a build-order prerequisite to the webui gate. This suite runs from src.
 */
const EN_SETTINGS_URL = new URL(
  '../../../packages/webui/src/i18n/locales/en/settings.json',
  import.meta.url,
);

type Guidance = Record<string, string | undefined>;

function enGuidance(): Guidance {
  const settings = JSON.parse(readFileSync(EN_SETTINGS_URL, 'utf8')) as {
    oauth?: { guidance?: Guidance };
  };
  return settings.oauth?.guidance ?? {};
}

describe('oauth guidance copy parity (en catalog ↔ registry notes)', () => {
  it('keeps every en oauth.guidance entry byte-identical to its strategy notes', () => {
    const guidance = enGuidance();
    for (const strategy of BUILTIN_PROVIDER_AUTH_STRATEGIES) {
      const notes = strategy.notes ?? [];
      // No notes ⇒ the catalog entry must be absent, not an empty string.
      const expected = notes.length > 0 ? notes.join('\n\n') : undefined;
      expect(guidance[strategy.id], `${strategy.id} guidance copy`).toBe(expected);
    }
  });

  it('has no orphan guidance entry for a strategy without notes', () => {
    const guidance = enGuidance();
    const withNotes = new Set(
      BUILTIN_PROVIDER_AUTH_STRATEGIES.filter((strategy) => strategy.notes?.length).map(
        (strategy) => strategy.id,
      ),
    );
    for (const key of Object.keys(guidance)) {
      expect(withNotes.has(key), `orphan oauth.guidance entry "${key}"`).toBe(true);
    }
  });
});

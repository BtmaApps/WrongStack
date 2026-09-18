import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_ROOT = path.resolve(import.meta.dirname, '../../src/i18n/locales');

/**
 * Locale bundles must never carry the secret-scanner's output-redaction token
 * (`[REDACTED:<pattern-id>]`). The token is produced when scanner-adjacent tool
 * output is copy-pasted back into a bundle; if it ships, users see the raw
 * placeholder instead of a label (it happened once: the "API Key" label in
 * setup.json was nearly overwritten by such a paste during a 2026-09-18 audit).
 * Keep the match loose (`[REDACTED:` prefix, any pattern id, any case) so the
 * guard catches every scanner output format variant.
 */
const REDACTED_TOKEN = /\[redacted:/i;

const REQUIRED_LOCALES = ['en', 'tr', 'de', 'es', 'fr', 'it', 'pt-BR'] as const;

interface StringValue {
  jsonPath: string;
  value: string;
}

function collectStringValues(node: unknown, jsonPath: string): StringValue[] {
  if (typeof node === 'string') return [{ jsonPath, value: node }];
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectStringValues(entry, `${jsonPath}[${index}]`));
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, entry]) =>
      collectStringValues(entry, jsonPath ? `${jsonPath}.${key}` : key),
    );
  }
  return [];
}

function redactedValues(relativePath: string, values: StringValue[]): string[] {
  return values
    .filter(({ value }) => REDACTED_TOKEN.test(value))
    .map(({ jsonPath, value }) => `${relativePath} -> ${jsonPath}: ${value.slice(0, 80)}`);
}

interface LocaleBundle {
  locale: string;
  relativePath: string;
  values: StringValue[];
}

function localeBundles(): LocaleBundle[] {
  return readdirSync(LOCALES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((localeEntry) =>
      readdirSync(path.join(LOCALES_ROOT, localeEntry.name))
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
          const relativePath = `${localeEntry.name}/${file}`;
          const parsed: unknown = JSON.parse(
            readFileSync(path.join(LOCALES_ROOT, localeEntry.name, file), 'utf8'),
          );
          return {
            locale: localeEntry.name,
            relativePath,
            values: collectStringValues(parsed, ''),
          };
        }),
    );
}

describe('WebUI locale redaction guard', () => {
  it('detects the bracket-REDACTED token shape at any depth', () => {
    const fixture = {
      ok: 'API Key (optional)',
      screen: {
        custom: { apiKey: '[REDACTED:some_pattern]' },
        list: ['fine', { nested: '[redacted:other_pattern]' }],
      },
      count: 3,
    };

    expect(redactedValues('fixture.json', collectStringValues(fixture, ''))).toEqual([
      'fixture.json -> screen.custom.apiKey: [REDACTED:some_pattern]',
      'fixture.json -> screen.list[1].nested: [redacted:other_pattern]',
    ]);
  });

  it('covers every locale bundle including the seven shipped locales', () => {
    const bundles = localeBundles();
    const byLocale = new Map<string, number>();
    for (const bundle of bundles) {
      byLocale.set(bundle.locale, (byLocale.get(bundle.locale) ?? 0) + 1);
    }

    const missing = REQUIRED_LOCALES.filter((locale) => (byLocale.get(locale) ?? 0) === 0);
    expect(missing).toEqual([]);
    for (const [locale, files] of byLocale) {
      expect(files, `locale ${locale} should scan at least one bundle`).toBeGreaterThan(0);
    }
  });

  it('keeps every locale string free of bracket-REDACTED tokens', () => {
    const bundles = localeBundles();
    const violations = bundles.flatMap((bundle) =>
      redactedValues(bundle.relativePath, bundle.values),
    );

    expect(violations).toEqual([]);
  });
});

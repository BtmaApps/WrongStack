/**
 * An "always allow" is stored against the call's permission subject.
 * `language_package` keyed it on `operation` alone, so approving `add zod`
 * "always" also approved adding any other package, in any language — what
 * `install` already rules out by keying on the packages themselves.
 */
import { subjectForToolInput } from '@wrongstack/core/utils';
import { describe, expect, it } from 'vitest';
import { languagePackageTool } from '../src/languages/package-tool.js';

const subject = (input: Record<string, unknown>) =>
  subjectForToolInput(
    languagePackageTool.name,
    input,
    languagePackageTool.subjectKey,
    languagePackageTool.subjectFields,
  );

describe('language_package permission subject', () => {
  const zod = { operation: 'add', language: 'typescript', names: ['zod'] };

  it('is stable for the same call', () => {
    expect(subject({ ...zod })).toBe(subject(zod));
  });

  it('differs per package, per language and with lifecycle scripts', () => {
    expect(subject({ ...zod, names: ['evil-pkg'] })).not.toBe(subject(zod));
    expect(subject({ ...zod, language: 'python' })).not.toBe(subject(zod));
    expect(subject({ ...zod, allowScripts: true })).not.toBe(subject(zod));
  });
});

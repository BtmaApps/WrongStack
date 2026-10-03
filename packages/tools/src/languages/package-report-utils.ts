import type { LanguagePackageVulnerability } from './types.js';

/** The output as one JSON document (stderr noise after it allowed), or null. */
export function parseJsonDocument(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function mapSeverity(value: string | undefined): LanguagePackageVulnerability['severity'] {
  switch (value?.toLowerCase()) {
    // `critical` is its own level: folded into `high`, every critical
    // advisory was reported one level low and the callers' `critical`
    // branches (and the audit tool's "N critical" count) never matched.
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
    case 'moderate':
      return 'moderate';
    case 'low':
      return 'low';
    case 'unknown':
      return 'unknown';
    default:
      return 'unknown';
  }
}

export function mapOutdatedKind(value: string | undefined): 'runtime' | 'development' | 'optional' {
  switch (value?.toLowerCase()) {
    case 'devdependencies':
    case 'development':
      return 'development';
    case 'optionaldependencies':
    case 'optional':
      return 'optional';
    default:
      return 'runtime';
  }
}

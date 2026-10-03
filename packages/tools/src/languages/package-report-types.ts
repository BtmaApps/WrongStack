import type {
  LanguageDiagnostic,
  LanguagePackageMutation,
  LanguagePackageVulnerability,
} from './types.js';

export interface ParsedPackageReports {
  diagnostics: readonly LanguageDiagnostic[];
  vulnerabilities: readonly LanguagePackageVulnerability[];
  outdated: readonly LanguagePackageMutation[];
}

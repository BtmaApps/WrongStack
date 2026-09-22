import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'lockfile-consistency-guard',
  toolName: 'lockfile_consistency_analyze',
  description:
    'Inspects lockfile and install evidence for mixed package managers, integrity failures, and reproducibility breaks',
  evidenceHint:
    'Inspect lockfile text or install output for reproducibility and consistency evidence.',
  rules: [
    {
      label: 'multiple lockfiles',
      severity: 'warning',
      pattern:
        /(?:package-lock\.json[\s\S]*pnpm-lock\.yaml|yarn\.lock[\s\S]*(?:pnpm-lock\.yaml|package-lock\.json))/i,
      advice: 'Keep only the lockfile owned by the selected package manager.',
    },
    {
      label: 'integrity failure',
      severity: 'error',
      pattern:
        /(?:integrity check failed|checksum.*(?:mismatch|failed)|ERR_PNPM_TARBALL_INTEGRITY)/i,
      advice: 'Clear the affected store entry and verify the package source before retrying.',
    },
    {
      label: 'non-reproducible install',
      severity: 'warning',
      pattern: /(?:--no-frozen-lockfile|lockfile.*ignored|update available.*lockfile)/i,
      advice: 'Use frozen installs in CI and commit the reviewed lockfile change.',
    },
  ],
});

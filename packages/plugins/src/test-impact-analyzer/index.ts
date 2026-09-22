import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'test-impact-analyzer',
  toolName: 'test_impact_analyze',
  description:
    'Inspects diffs and test output for untested changes, focused-test exclusions, and skipped coverage evidence',
  evidenceHint: 'Inspect a diff, changed-file list, or test output for test-impact signals.',
  rules: [
    {
      label: 'source change without visible test reference',
      severity: 'warning',
      pattern: /^\+.*\.(?:ts|tsx|js|jsx)\b(?!.*(?:test|spec)\.)/m,
      advice: 'Map each changed source unit to an appropriate focused regression test.',
    },
    {
      label: 'skipped test',
      severity: 'warning',
      pattern: /\b(?:skip|todo|pending)\b/i,
      advice: 'Record why the scenario is skipped and restore coverage when practical.',
    },
    {
      label: 'coverage threshold failure',
      severity: 'error',
      pattern: /coverage threshold.*(?:not met|failed)|thresholds? .*not met/i,
      advice: 'Add or adjust tests before accepting the change.',
    },
  ],
});

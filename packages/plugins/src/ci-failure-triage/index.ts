import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'ci-failure-triage',
  toolName: 'ci_failure_triage',
  description:
    'Classifies supplied CI logs into actionable dependency, test, type-check, and infrastructure failure evidence',
  evidenceHint: 'Inspect CI or command output and classify actionable failure signatures.',
  rules: [
    {
      label: 'test failure',
      severity: 'error',
      pattern: /(?:FAIL|AssertionError|Expected:|Tests?\s+\d+\s+failed)/i,
      advice:
        'Reproduce the named test locally and keep the failing assertion as the repair proof.',
    },
    {
      label: 'type-check failure',
      severity: 'error',
      pattern: /\bTS\d{4}\b|Type error:/,
      advice: 'Fix the reported type boundary rather than suppressing the diagnostic.',
    },
    {
      label: 'transient network or registry failure',
      severity: 'warning',
      pattern: /(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|registry.*(?:503|504))/i,
      advice:
        'Retry once with preserved logs, then separate infrastructure failure from a product regression.',
    },
  ],
});

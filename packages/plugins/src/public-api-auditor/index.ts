import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'public-api-auditor',
  toolName: 'public_api_analyze',
  description:
    'Inspects public entry-point evidence for undocumented exports, deprecated contracts, and accidental internal API exposure',
  evidenceHint:
    'Inspect a public entry point or API report for documentation and compatibility signals.',
  rules: [
    {
      label: 'undocumented exported declaration',
      severity: 'warning',
      pattern: /^export\s+(?:async\s+)?(?:function|class|interface|type|const)\s+/m,
      advice:
        'Review exported declarations for an adjacent public contract comment and test coverage.',
    },
    {
      label: 'deprecated public contract',
      severity: 'info',
      pattern: /@deprecated\b/i,
      advice: 'Ensure the replacement path and removal timeline are documented.',
    },
    {
      label: 'internal path exported',
      severity: 'warning',
      pattern: /export .*['"][^'"]*(?:\/internal\/|\/src\/)[^'"]*['"]/i,
      advice: 'Expose a stable facade instead of leaking internal module paths.',
    },
  ],
});

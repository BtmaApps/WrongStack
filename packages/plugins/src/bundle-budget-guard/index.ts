import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'bundle-budget-guard',
  toolName: 'bundle_budget_analyze',
  description:
    'Inspects build and bundle reports for budget breaches, unexpectedly large assets, and sourcemap publication signals',
  evidenceHint:
    'Inspect a bundle report or build output for size-budget and artifact exposure evidence.',
  rules: [
    {
      label: 'bundle budget exceeded',
      severity: 'error',
      pattern: /(?:bundle|asset|chunk).*(?:budget|limit).*(?:exceeded|over)/i,
      advice: 'Identify the changed dependency or import path and reduce or split the payload.',
    },
    {
      label: 'large JavaScript asset',
      severity: 'warning',
      pattern: /\b(?:[5-9]\d{2}|[1-9]\d{3,})\s*(?:kB|KB)\b.*\.js\b/i,
      advice: 'Review whether the asset can be code-split or its dependency reduced.',
    },
    {
      label: 'published source map',
      severity: 'info',
      pattern: /\.map\b.*(?:emit|upload|publish)|sourcemap.*(?:upload|public)/i,
      advice: 'Confirm sourcemap access matches the intended observability and disclosure policy.',
    },
  ],
});

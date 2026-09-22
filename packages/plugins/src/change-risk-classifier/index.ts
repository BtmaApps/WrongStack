import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'change-risk-classifier',
  toolName: 'change_risk_analyze',
  description:
    'Inspects diffs or change descriptions for authentication, persistence, destructive-operation, and compatibility risk signals',
  evidenceHint:
    'Inspect a diff or change description and surface risk signals that merit targeted proof.',
  rules: [
    {
      label: 'authentication or authorization change',
      severity: 'warning',
      pattern: /\b(?:auth(?:entication|orization)?|permission|role|RBAC|session|token)\b/i,
      advice: 'Add positive and negative access-control regression coverage.',
    },
    {
      label: 'persistence or migration change',
      severity: 'warning',
      pattern: /\b(?:migration|schema|database|ALTER TABLE|DROP TABLE|persist)\b/i,
      advice: 'Prove upgrade, rollback, and existing-data behavior before release.',
    },
    {
      label: 'destructive operation',
      severity: 'error',
      pattern: /\b(?:rm -rf|DROP\s+(?:TABLE|DATABASE)|deleteAll|truncate|force push)\b/i,
      advice: 'Require an explicit target, backup/recovery plan, and review before execution.',
    },
  ],
});

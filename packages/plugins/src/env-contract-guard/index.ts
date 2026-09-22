import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'env-contract-guard',
  toolName: 'env_contract_analyze',
  description:
    'Inspects environment templates and runtime diagnostics for missing, placeholder, or accidentally exposed configuration contracts',
  evidenceHint:
    'Inspect an environment template or runtime diagnostic without submitting secret values.',
  rules: [
    {
      label: 'placeholder secret',
      severity: 'warning',
      pattern:
        /(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*(?:changeme|replace.me|your[_-]?(?:key|token)|<[^>]+>)/i,
      advice: 'Replace placeholders through the deployment secret store, never commit real values.',
    },
    {
      label: 'missing required environment variable',
      severity: 'error',
      pattern:
        /(?:missing|required) (?:environment variable|env var)|process\.env\.[A-Z0-9_]+\s*!/i,
      advice: 'Declare the requirement in the template and provide it in the runtime environment.',
    },
    {
      label: 'environment value exposed',
      severity: 'error',
      pattern: /(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s#]{16,}/i,
      advice: 'Treat the value as compromised, rotate it, and remove it from the evidence source.',
    },
  ],
});

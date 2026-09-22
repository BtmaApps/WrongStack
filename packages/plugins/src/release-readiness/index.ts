import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'release-readiness',
  toolName: 'release_readiness_analyze',
  description:
    'Inspects supplied release-gate output for unmet validation, dirty-tree, publish, and version-alignment evidence',
  evidenceHint:
    'Inspect release-gate output, a changelog, or a version manifest for blocking readiness evidence.',
  rules: [
    {
      label: 'release gate failure',
      severity: 'error',
      pattern: /(?:release:check|release gate|prepublish).*(?:failed|error)|\bFAILED\b/i,
      advice: 'Resolve the authoritative failing gate and rerun it before publishing.',
    },
    {
      label: 'dirty worktree',
      severity: 'warning',
      pattern: /(?:working tree|worktree).*(?:dirty|modified)|\bM\s+\S+/i,
      advice:
        'Explicitly review the pending files before deciding whether they belong in the release.',
    },
    {
      label: 'version mismatch',
      severity: 'error',
      pattern: /(?:version).*(?:mismatch|does not match|out of sync)/i,
      advice: 'Align release manifests and public metadata from the canonical version source.',
    },
  ],
});

import { createEvidenceAnalyzerPlugin } from '../evidence-analyzer/index.js';
export default createEvidenceAnalyzerPlugin({
  name: 'dependency-drift-detector',
  toolName: 'dependency_drift_analyze',
  description:
    'Inspects manifests and package-manager output for unpinned ranges, lockfile mismatch, and peer dependency drift',
  evidenceHint:
    'Inspect a package manifest, lockfile fragment, or package-manager output for dependency drift.',
  rules: [
    {
      label: 'unbounded dependency range',
      severity: 'warning',
      pattern:
        /"(?:dependencies|devDependencies|peerDependencies)"[\s\S]{0,400}?"[^"]+"\s*:\s*"(?:\*|latest)"/i,
      advice: 'Use an intentional semver range or a pinned version according to project policy.',
    },
    {
      label: 'lockfile mismatch',
      severity: 'error',
      pattern:
        /(?:lockfile.*(?:out of date|outdated|not up to date|mismatch)|ERR_PNPM_(?:OUTDATED|BROKEN)_LOCKFILE|cannot install with.*frozen-lockfile)/i,
      advice: 'Regenerate and review the lockfile with the declared package manager.',
    },
    {
      label: 'peer dependency conflict',
      severity: 'warning',
      pattern: /(?:peer dependency|ERESOLVE).*(?:conflict|unmet|invalid)/i,
      advice: 'Resolve the compatible version set instead of forcing installation.',
    },
  ],
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import workspaceHealth from '../src/workspace-health/index.js';
import testImpactAnalyzer from '../src/test-impact-analyzer/index.js';
import ciFailureTriage from '../src/ci-failure-triage/index.js';
import envContractGuard from '../src/env-contract-guard/index.js';
import dependencyDriftDetector from '../src/dependency-drift-detector/index.js';
import releaseReadiness from '../src/release-readiness/index.js';
import bundleBudgetGuard from '../src/bundle-budget-guard/index.js';
import publicApiAuditor from '../src/public-api-auditor/index.js';
import lockfileConsistencyGuard from '../src/lockfile-consistency-guard/index.js';
import changeRiskClassifier from '../src/change-risk-classifier/index.js';

const evidencePlugins = [
  ['workspace-health', 'workspace_health_analyze', 'ERR_PNPM_NO_SCRIPT', workspaceHealth],
  ['test-impact-analyzer', 'test_impact_analyze', 'coverage threshold not met', testImpactAnalyzer],
  ['ci-failure-triage', 'ci_failure_triage', 'TS2322: Type error', ciFailureTriage],
  ['env-contract-guard', 'env_contract_analyze', 'API_KEY=replace-me', envContractGuard],
  [
    'dependency-drift-detector',
    'dependency_drift_analyze',
    'ERESOLVE peer dependency conflict',
    dependencyDriftDetector,
  ],
  ['release-readiness', 'release_readiness_analyze', 'release gate failed', releaseReadiness],
  ['bundle-budget-guard', 'bundle_budget_analyze', 'bundle budget exceeded', bundleBudgetGuard],
  [
    'public-api-auditor',
    'public_api_analyze',
    'export { helper } from "./src/internal/helper"',
    publicApiAuditor,
  ],
  [
    'lockfile-consistency-guard',
    'lockfile_consistency_analyze',
    'checksum mismatch',
    lockfileConsistencyGuard,
  ],
  ['change-risk-classifier', 'change_risk_analyze', 'DROP TABLE users', changeRiskClassifier],
] as const;

function createApi(name: string, enabled = true) {
  return {
    tools: { register: vi.fn() },
    config: { extensions: { [name]: { enabled } } },
    log: { info: vi.fn() },
  };
}

function tool(api: ReturnType<typeof createApi>, name: string) {
  const registered = api.tools.register.mock.calls.find(([value]) => value.name === name)?.[0] as
    | { execute: (input: { content: string }) => Promise<unknown> }
    | undefined;
  if (!registered) throw new Error(`missing registered tool ${name}`);
  return registered.execute;
}

afterEach(() => {
  for (const [name, , , plugin] of evidencePlugins) {
    plugin.teardown?.(createApi(name) as never);
  }
});

describe('evidence analyzer suite', () => {
  it.each(evidencePlugins)(
    '%s registers its focused read-only analyzer and returns evidence',
    async (name, toolName, evidence, plugin) => {
      const api = createApi(name);
      plugin.setup(api as never);
      const registered = api.tools.register.mock.calls[0]?.[0] as {
        name: string;
        permission: string;
        mutating: boolean;
      };
      expect(registered.name).toBe(toolName);
      expect(registered.permission).toBe('auto');
      expect(registered.mutating).toBe(false);
      const result = (await tool(api, toolName)({ content: evidence })) as {
        ok: boolean;
        findings: unknown[];
        limitation: string;
      };
      expect(result.ok).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.limitation).toMatch(/supplied evidence/i);
    },
  );

  it('honours the common enabled switch', async () => {
    const api = createApi('ci-failure-triage', false);
    ciFailureTriage.setup(api as never);
    await expect(tool(api, 'ci_failure_triage')({ content: 'FAIL example' })).rejects.toThrow(
      /disabled/,
    );
  });

  it('redacts credential-like values from reported evidence', async () => {
    const api = createApi('env-contract-guard');
    envContractGuard.setup(api as never);
    const result = (await tool(
      api,
      'env_contract_analyze',
    )({
      content: 'API_KEY=very-sensitive-value-that-must-not-echo',
    })) as { findings: Array<{ excerpt: string }> };
    expect(result.findings[0]?.excerpt).toContain('API_KEY=[REDACTED]');
    expect(result.findings[0]?.excerpt).not.toContain('very-sensitive');
  });
});

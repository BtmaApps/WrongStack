import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Tool } from '@wrongstack/core/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bundleBudgetGuard from '../src/bundle-budget-guard/index.js';
import changeRiskClassifier from '../src/change-risk-classifier/index.js';
import ciFailureTriage from '../src/ci-failure-triage/index.js';
import dependencyDriftDetector from '../src/dependency-drift-detector/index.js';
import envContractGuard from '../src/env-contract-guard/index.js';
import lockfileConsistencyGuard from '../src/lockfile-consistency-guard/index.js';
import publicApiAuditor from '../src/public-api-auditor/index.js';
import releaseReadiness from '../src/release-readiness/index.js';
import testImpactAnalyzer from '../src/test-impact-analyzer/index.js';
import workspaceHealth from '../src/workspace-health/index.js';

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

const apis: Array<{ name: string; api: unknown }> = [];
function createApi(name: string, enabled = true) {
  const api = {
    tools: { register: vi.fn() },
    config: { extensions: { [name]: { enabled } } },
    log: { info: vi.fn() },
  };
  apis.push({ name, api });
  return api;
}

function tool(api: ReturnType<typeof createApi>, name: string) {
  const registered = api.tools.register.mock.calls.find(([value]) => value.name === name)?.[0] as
    | { execute: (input: { content: string }) => Promise<unknown> }
    | undefined;
  if (!registered) throw new Error(`missing registered tool ${name}`);
  return registered.execute;
}

afterEach(() => {
  for (const { name, api } of apis.splice(0)) {
    evidencePlugins.find(([pluginName]) => pluginName === name)?.[3].teardown?.(api as never);
  }
});

describe('evidence analyzer suite', () => {
  it('rejects symlinked evidence outside the caller project', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'evidence-link-'));
    const root = join(directory, 'project');
    const outside = join(directory, 'outside');
    const api = createApi('ci-failure-triage');
    try {
      await mkdir(root);
      await mkdir(outside);
      await writeFile(join(outside, 'evidence.txt'), 'FAIL private evidence');
      await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
      await ciFailureTriage.setup(api as never);
      const registered = api.tools.register.mock.calls[0]![0] as Tool;
      await expect(
        registered.execute({ path: 'link/evidence.txt' }, { projectRoot: root } as never, {
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(/inside the project/);
    } finally {
      await ciFailureTriage.teardown?.(api as never);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('honours config changes and preserves CRLF evidence locations', async () => {
    const api = createApi('ci-failure-triage');
    await ciFailureTriage.setup(api as never);
    try {
      const execute = tool(api, 'ci_failure_triage');
      expect(await execute({ content: 'heading\r\nTS2322: broken\r\n' })).toMatchObject({
        findings: [{ line: 2, excerpt: 'TS2322: broken' }],
      });
      api.config.extensions['ci-failure-triage']!.enabled = false;
      await expect(execute({ content: 'FAIL' })).rejects.toThrow(/disabled/);
    } finally {
      await ciFailureTriage.teardown?.(api as never);
    }
  });

  it('does not classify a successful frozen install command as lockfile failure', async () => {
    const api = createApi('dependency-drift-detector');
    await dependencyDriftDetector.setup(api as never);
    try {
      expect(
        await tool(
          api,
          'dependency_drift_analyze',
        )({ content: 'pnpm install --frozen-lockfile\nDone' }),
      ).toMatchObject({ findings: [] });
    } finally {
      await dependencyDriftDetector.teardown?.(api as never);
    }
  });

  it('does not turn zero failed tests into a CI failure', async () => {
    const api = createApi('ci-failure-triage');
    await ciFailureTriage.setup(api as never);
    try {
      expect(
        await tool(api, 'ci_failure_triage')({ content: 'Tests 0 failed | 50 passed' }),
      ).toMatchObject({ findings: [] });
    } finally {
      await ciFailureTriage.teardown?.(api as never);
    }
  });
  it.each(evidencePlugins)(
    '%s reads evidence from the calling project',
    async (name, _toolName, evidence, plugin) => {
      const root = await mkdtemp(join(tmpdir(), 'evidence-project-'));
      const api = createApi(name);
      try {
        await writeFile(join(root, 'evidence.txt'), evidence);
        await plugin.setup(api as never);
        const registered = api.tools.register.mock.calls[0]![0] as Tool;
        const result = await registered.execute(
          { path: 'evidence.txt' },
          {
            projectRoot: root,
          } as never,
          { signal: new AbortController().signal },
        );
        expect(result).toMatchObject({ plugin: name });
        expect((result as { findings: unknown[] }).findings.length).toBeGreaterThan(0);
      } finally {
        await plugin.teardown?.(api as never);
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it.each(evidencePlugins)(
    '%s rejects cancelled and unloaded calls without affecting another host',
    async (name, toolName, evidence, plugin) => {
      const first = createApi(name);
      const second = createApi(name);
      await plugin.setup(first as never);
      await plugin.setup(second as never);
      const registered = first.tools.register.mock.calls[0]![0] as Tool;
      await expect(
        registered.execute({ content: evidence }, {} as never, { signal: AbortSignal.abort() }),
      ).rejects.toThrow();
      await plugin.teardown?.(first as never);
      await expect(tool(first, toolName)({ content: evidence })).rejects.toThrow();
      await expect(tool(second, toolName)({ content: evidence })).resolves.toMatchObject({
        ok: true,
      });
      await plugin.teardown?.(second as never);
    },
  );
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

import { describe, expect, it } from 'vitest';
import { detectWorkspaceMisalignments } from '../../src/index.js';
import type { DependencyObservation, Workspace } from '../../src/types.js';

describe('Cross-Workspace Version Misalignment Detector', () => {
  const workspaces: Workspace[] = [
    {
      id: 'ws-app',
      relativeRoot: 'apps/web',
      ecosystem: 'npm',
      manifests: ['package.json'],
      lockfiles: ['pnpm-lock.yaml'],
      confidence: 1.0,
      coverage: 'full',
    },
    {
      id: 'ws-core',
      relativeRoot: 'packages/core',
      ecosystem: 'npm',
      manifests: ['package.json'],
      lockfiles: ['pnpm-lock.yaml'],
      confidence: 1.0,
      coverage: 'full',
    },
  ];

  it('returns empty array when there is only one workspace', () => {
    const singleWs = [workspaces[0]!];
    const deps: DependencyObservation[] = [
      {
        id: 'dep-1',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.22.0',
        locked: '3.22.4',
        status: 'current',
        evidence: [],
      },
    ];

    expect(detectWorkspaceMisalignments(deps, singleWs)).toEqual([]);
  });

  it('returns empty array when all workspaces use aligned versions', () => {
    const deps: DependencyObservation[] = [
      {
        id: 'dep-1',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.22.0',
        locked: '3.22.4',
        status: 'current',
        evidence: [],
      },
      {
        id: 'dep-2',
        workspaceId: 'ws-core',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.22.0',
        locked: '3.22.4',
        status: 'current',
        evidence: [],
      },
    ];

    expect(detectWorkspaceMisalignments(deps, workspaces)).toEqual([]);
  });

  it('detects version mismatch across workspaces and generates findings', () => {
    const deps: DependencyObservation[] = [
      {
        id: 'dep-app-zod',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.22.0',
        locked: '3.22.4',
        status: 'current',
        evidence: [],
      },
      {
        id: 'dep-core-zod',
        workspaceId: 'ws-core',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.20.0',
        locked: '3.20.2',
        status: 'current',
        evidence: [],
      },
    ];

    const findings = detectWorkspaceMisalignments(deps, workspaces);
    expect(findings).toHaveLength(2);

    expect(findings[0]!.type).toBe('investigate');
    expect(findings[0]!.severity).toBe('info');
    expect(findings[0]!.confidence).toBe(1.0);
    expect(findings[0]!.rationale).toContain('Version mismatch across workspaces');
    expect(findings[0]!.rationale).toContain('apps/web uses 3.22.4');
    expect(findings[0]!.rationale).toContain('packages/core (3.20.2)');

    expect(findings[1]!.dependencyId).toBe('dep-core-zod');
    expect(findings[1]!.rationale).toContain('packages/core uses 3.20.2');
  });

  it('ignores local path and git dependencies', () => {
    const deps: DependencyObservation[] = [
      {
        id: 'dep-path-1',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: '@wrongstack/core',
        sourceType: 'path',
        direct: true,
        scope: 'runtime',
        requested: 'workspace:*',
        status: 'local_path',
        evidence: [],
      },
      {
        id: 'dep-path-2',
        workspaceId: 'ws-core',
        ecosystem: 'npm',
        name: '@wrongstack/core',
        sourceType: 'path',
        direct: true,
        scope: 'runtime',
        requested: 'workspace:*',
        status: 'local_path',
        evidence: [],
      },
      {
        id: 'dep-git-1',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'git-pkg',
        sourceType: 'git',
        direct: true,
        scope: 'runtime',
        requested: 'github:org/repo#a',
        locked: '1.0.0',
        status: 'current',
        evidence: [],
      },
      {
        id: 'dep-git-2',
        workspaceId: 'ws-core',
        ecosystem: 'npm',
        name: 'git-pkg',
        sourceType: 'git',
        direct: true,
        scope: 'runtime',
        requested: 'github:org/repo#b',
        locked: '2.0.0',
        status: 'current',
        evidence: [],
      },
    ];

    expect(detectWorkspaceMisalignments(deps, workspaces)).toEqual([]);

    const multiWithinWs: DependencyObservation[] = [
      {
        id: 'dep-m1',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'semver',
        sourceType: 'registry',
        direct: false,
        scope: 'transitive',
        locked: '7.5.4',
        status: 'current',
        evidence: [],
      },
      {
        id: 'dep-m2',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'semver',
        sourceType: 'registry',
        direct: false,
        scope: 'transitive',
        locked: '6.3.1',
        status: 'current',
        evidence: [],
      },
      {
        id: 'dep-m3',
        workspaceId: 'ws-core',
        ecosystem: 'npm',
        name: 'semver',
        sourceType: 'registry',
        direct: false,
        scope: 'transitive',
        locked: '7.5.4',
        status: 'current',
        evidence: [],
      },
    ];
    const multiFindings = detectWorkspaceMisalignments(multiWithinWs, workspaces);
    expect(multiFindings[0]?.rationale).toContain('apps/web (6.3.1, 7.5.4)');
  });

  it('detects misalignment across installed versions when locked is absent', () => {
    const deps: DependencyObservation[] = [
      {
        id: 'dep-inst-1',
        workspaceId: 'ws-app',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.0.0',
        installed: '3.22.4',
        status: 'current',
        evidence: [],
      },
      {
        id: 'dep-inst-2',
        workspaceId: 'ws-core',
        ecosystem: 'npm',
        name: 'zod',
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        requested: '^3.0.0',
        installed: '3.20.2',
        status: 'current',
        evidence: [],
      },
    ];
    const findings = detectWorkspaceMisalignments(deps, workspaces);
    expect(findings).toHaveLength(2);
    expect(findings[0]?.rationale).toContain('3.22.4');
    expect(findings[0]?.rationale).toContain('3.20.2');
  });
});

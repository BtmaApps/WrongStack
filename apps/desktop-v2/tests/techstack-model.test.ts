import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EngineHttpError } from '../src/engine-http-error';
import { TechDependencyDetail, TechFinding } from '../src/TechStackEvidence';
import {
  techFilteredDependencies,
  techInterpretation,
  techPlanKey,
  techPlanSelectionIsCurrent,
  techRunning,
  techSummary,
  techVersion,
} from '../src/techstack-model';

const snapshot = {
  dependencies: [
    {
      id: 'a',
      name: 'package-a',
      ecosystem: 'npm',
      workspaceId: 'one',
      direct: true,
      status: 'vulnerable',
      requested: '^1',
      locked: '1.2',
      installed: '1.1',
    },
    {
      id: 'b',
      name: 'package-a',
      ecosystem: 'npm',
      workspaceId: 'two',
      direct: false,
      status: 'update_available_safe',
      installed: '2.0',
    },
  ],
  workspaces: [{ id: 'one' }, { id: 'two' }],
  findings: [{ id: 'finding' }],
};
describe('Desktop TechStack observations and approvals', () => {
  it('retains separate workspace observations and direct/transitive filtering', () => {
    expect(techFilteredDependencies(snapshot, ' package-a ', '', '', '')).toHaveLength(2);
    expect(
      techFilteredDependencies(snapshot, '', 'two', '', 'transitive').map((item) => item['id']),
    ).toEqual(['b']);
    expect(
      techFilteredDependencies(snapshot, '', '', 'vulnerable', 'direct').map((item) => item['id']),
    ).toEqual(['a']);
    expect(techSummary(snapshot)).toEqual({
      total: 2,
      direct: 1,
      workspaces: 2,
      vulnerable: 1,
      upgrades: 1,
      findings: 1,
    });
  });
  it('uses locked, installed and requested in order without inventing a latest version', () => {
    expect(techVersion(snapshot.dependencies[0]!)).toBe('1.2');
    expect(techVersion(snapshot.dependencies[1]!)).toBe('2.0');
    expect(techVersion({ requested: '^1' })).toBe('^1');
    expect(techVersion({})).toBe('Not reported');
  });
  it('marks agent-derived evidence independently of reported confidence', () => {
    expect(techInterpretation({ confidence: 1, evidence: [{ kind: 'agent' }] })).toBe(true);
    expect(techInterpretation({ confidence: 0.7, evidence: [] })).toBe(true);
    expect(techInterpretation({ confidence: 1, evidence: [{ kind: 'registry' }] })).toBe(false);
  });
  it('refuses selected targets when a snapshot, version, rationale or risk changed', () => {
    const item = {
      workspaceId: 'one',
      ecosystem: 'npm',
      dependencyName: 'a',
      action: 'upgrade_major',
      currentVersion: '1',
      targetVersion: '2',
      rationale: 'New release',
      breakingRisk: 'API change',
      severity: 'high',
    };
    const plan = { snapshotId: 'snapshot', items: [item] };
    const keys = [techPlanKey(item)];
    expect(techPlanSelectionIsCurrent(plan, { ...plan, generatedAt: 'later' }, keys)).toBe(true);
    for (const field of [
      'targetVersion',
      'currentVersion',
      'rationale',
      'breakingRisk',
      'severity',
    ])
      expect(
        techPlanSelectionIsCurrent(
          plan,
          { ...plan, items: [{ ...item, [field]: 'changed' }] },
          keys,
        ),
      ).toBe(false);
    expect(techPlanSelectionIsCurrent(plan, { ...plan, snapshotId: 'new' }, keys)).toBe(false);
    expect(techPlanSelectionIsCurrent(plan, plan, [])).toBe(false);
  });
  it('preserves structured HTTP absence and refuses to confuse errors with an empty snapshot', () => {
    const error = new EngineHttpError(404, { snapshot: null, stale: false });
    expect(error.status).toBe(404);
    expect(error.data).toEqual({ snapshot: null, stale: false });
    expect(new EngineHttpError(503, { error: 'Engine unavailable' }).message).toBe(
      'Engine unavailable',
    );
  });
  it('tracks only canonical active phases as running', () => {
    for (const status of [
      'queued',
      'discovering',
      'inventorying',
      'enriching',
      'researching',
      'synthesizing',
    ])
      expect(techRunning({ status })).toBe(true);
    for (const status of ['completed', 'cancelled', 'failed', 'unknown'])
      expect(techRunning({ status })).toBe(false);
  });
  it('renders facts, constraints, missing values and model interpretation as readable fields', () => {
    const detail = renderToStaticMarkup(
      createElement(TechDependencyDetail, {
        dependency: snapshot.dependencies[0]!,
        findings: [],
        canResearch: false,
        researching: false,
        researchNote: '',
        onResearch() {},
        onOpenFile() {},
      }),
    );
    expect(detail).toContain('Requested constraint');
    expect(detail).toContain('Latest stable registry version');
    expect(detail).toContain('Not reported');
    const finding = renderToStaticMarkup(
      createElement(TechFinding, {
        finding: {
          type: 'upgrade',
          severity: 'high',
          action: 'upgrade_major',
          confidence: 0.5,
          rationale: 'Review the migration.',
          evidence: [{ kind: 'agent', source: 'fixture', retrievedAt: '2026-10-27' }],
        },
        onOpenFile() {},
      }),
    );
    expect(finding).toContain('Model interpretation');
    expect(finding).toContain('50% confidence');
    expect(finding).not.toContain('[object Object]');
  });
});

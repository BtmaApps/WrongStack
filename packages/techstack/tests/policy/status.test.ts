/**
 * TechStack — Status classification tests.
 *
 * Tests the classifyStatus function and its helper compareVersions.
 * Covers all rules from SDD R8/R9:
 * - Private/unresolved (404/401) → private_or_unresolved (never dead)
 * - Failed lookup → unknown (never current)
 * - Deprecated → deprecated
 * - Yanked → yanked
 * - Advisory → vulnerable
 * - Version comparisons
 *
 * @see packages/techstack/src/policy/status.ts
 */

import { describe, expect, it } from 'vitest';
import type { AdvisoryStatusData, RegistryStatusData } from '../../src/policy/status.js';
import {
  classifyStatus,
  compareVersions,
  failedLookupStatus,
  privateOrUnresolvedStatus,
} from '../../src/policy/status.js';

// ── Helper factories ───────────────────────────────────────────────────────

function makeDep(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-pkg',
    sourceType: 'registry',
    status: 'current',
    locked: '1.0.0',
    requested: '^1.0.0',
    ...overrides,
  } as const;
}

// ── compareVersions ────────────────────────────────────────────────────────

describe('compareVersions', () => {
  it('returns -1 when a < b', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('returns 0 when a === b', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.5.3', '2.5.3')).toBe(0);
  });

  it('returns 1 when a > b', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  it('handles prerelease versions', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('orders PEP 440 post/pre/dev releases instead of throwing', () => {
    // These threw, and classifyStatus then called the outdated dep current.
    expect(compareVersions('2.8.2', '2.9.0.post0')).toBe(-1);
    expect(compareVersions('1.0.post1', '1.0')).toBe(1);
    expect(compareVersions('5.0rc1', '5.0')).toBe(-1);
    expect(compareVersions('1.0.dev0', '1.0a1')).toBe(-1);
    expect(compareVersions('1.0a1', '1.0b2')).toBe(-1);
    expect(
      classifyStatus(
        makeDep({ locked: '2.8.2', requested: '>=2.8', ecosystem: 'python' }) as never,
        { latestStable: '2.9.0.post0' },
      ),
    ).toBe('update_available_safe');
  });
});

// ── classifyStatus — Source type rules ─────────────────────────────────────

describe('classifyStatus — source type', () => {
  it('returns local_path for path source type', () => {
    const result = classifyStatus(makeDep({ sourceType: 'path' }));
    expect(result).toBe('local_path');
  });

  it('returns git_dependency for git source type', () => {
    const result = classifyStatus(makeDep({ sourceType: 'git' }));
    expect(result).toBe('git_dependency');
  });
});

// ── classifyStatus — Private/unresolved ────────────────────────────────────

describe('classifyStatus — private/unresolved (R8)', () => {
  it('returns private_or_unresolved when registry returns 404/401', () => {
    const registryData: RegistryStatusData = {
      privateOrUnresolved: true,
    };
    const result = classifyStatus(makeDep(), registryData);
    expect(result).toBe('private_or_unresolved');
  });

  it('never returns dead or deprecated for private packages', () => {
    const registryData: RegistryStatusData = {
      privateOrUnresolved: true,
      deprecated: true, // should be ignored
    };
    const dep = makeDep({ sourceType: 'registry', status: 'current' });
    const result = classifyStatus(dep, registryData);
    expect(result).not.toBe('deprecated');
    expect(result).toBe('private_or_unresolved');
  });
});

// ── classifyStatus — Failed lookup ─────────────────────────────────────────

describe('classifyStatus — failed lookup (R9)', () => {
  it('returns unknown when registry lookup failed', () => {
    const registryData: RegistryStatusData = {
      lookupFailed: true,
    };
    const result = classifyStatus(makeDep(), registryData);
    expect(result).toBe('unknown');
  });

  it('never returns current for failed lookups', () => {
    const registryData: RegistryStatusData = {
      lookupFailed: true,
      latestStable: '2.0.0', // should be ignored
    };
    const dep = makeDep({ status: 'current', locked: '1.0.0' });
    const result = classifyStatus(dep, registryData);
    expect(result).not.toBe('current');
    expect(result).toBe('unknown');
  });
});

// ── classifyStatus — Deprecated / Yanked ───────────────────────────────────

describe('classifyStatus — deprecated / yanked', () => {
  it('returns deprecated when registry says deprecated', () => {
    const registryData: RegistryStatusData = { deprecated: true };
    const result = classifyStatus(makeDep(), registryData);
    expect(result).toBe('deprecated');
  });

  it('returns yanked when registry says yanked', () => {
    const registryData: RegistryStatusData = { yanked: true };
    const result = classifyStatus(makeDep(), registryData);
    expect(result).toBe('yanked');
  });
});

// ── classifyStatus — Vulnerable ────────────────────────────────────────────

describe('classifyStatus — vulnerable', () => {
  it('returns vulnerable when advisory exists', () => {
    const advisoryData: AdvisoryStatusData = { hasAdvisory: true };
    const result = classifyStatus(makeDep(), undefined, advisoryData);
    expect(result).toBe('vulnerable');
  });
});

// ── classifyStatus — Version comparison ────────────────────────────────────

describe('classifyStatus — version comparison', () => {
  it('returns current when locked === latestStable', () => {
    const registryData: RegistryStatusData = { latestStable: '1.0.0' };
    const dep = makeDep({ locked: '1.0.0', requested: '^1.0.0' });
    const result = classifyStatus(dep, registryData);
    expect(result).toBe('current');
  });

  it('returns update_available_safe when locked < latestStable and within constraint', () => {
    const registryData: RegistryStatusData = { latestStable: '1.1.0' };
    const dep = makeDep({ locked: '1.0.0', requested: '^1.0.0' });
    const result = classifyStatus(dep, registryData);
    expect(result).toBe('update_available_safe');
  });

  it('returns update_available_breaking when major version changes with ^ constraint', () => {
    const registryData: RegistryStatusData = { latestStable: '2.0.0' };
    const dep = makeDep({ locked: '1.0.0', requested: '^1.0.0' });
    const result = classifyStatus(dep, registryData);
    expect(result).toBe('update_available_breaking');
  });

  // An exact pin means "don't move without a decision" — a manifest question,
  // not a compatibility one. Reading every pinned patch release as breaking
  // marked most of a pin-heavy repo as needing a major upgrade.
  it('treats a patch bump under an exact pin as safe, not breaking', () => {
    const registryData: RegistryStatusData = { latestStable: '2.5.4' };
    const dep = makeDep({ locked: '2.5.3', requested: '2.5.3' });
    expect(classifyStatus(dep, registryData)).toBe('update_available_safe');
  });

  it('treats a minor bump under an exact pin as safe', () => {
    const registryData: RegistryStatusData = { latestStable: '2.6.0' };
    const dep = makeDep({ locked: '2.5.3', requested: '2.5.3' });
    expect(classifyStatus(dep, registryData)).toBe('update_available_safe');
  });

  it('still reports breaking for a major bump under an exact pin', () => {
    const registryData: RegistryStatusData = { latestStable: '3.0.0' };
    const dep = makeDep({ locked: '2.5.3', requested: '2.5.3' });
    expect(classifyStatus(dep, registryData)).toBe('update_available_breaking');
  });

  // For `^0.y.z` the breaking axis is the MINOR, not the major: `^0.2.3` means
  // `>=0.2.3 <0.3.0`, so 0.3.0 is outside the declared range. A major-only
  // comparison called that a safe upgrade — advice the manifest forbids — which
  // also contradicted this package's own caret semantics (`caretUpper`).
  it('reports breaking when a ^0.y.z constraint excludes a minor bump', () => {
    const registryData: RegistryStatusData = { latestStable: '0.3.0' };
    const dep = makeDep({ locked: '0.2.5', requested: '^0.2.3' });
    expect(classifyStatus(dep, registryData)).toBe('update_available_breaking');
  });

  it('reports breaking when a ^0.0.z constraint excludes a patch bump', () => {
    const registryData: RegistryStatusData = { latestStable: '0.0.4' };
    const dep = makeDep({ locked: '0.0.3', requested: '^0.0.3' });
    expect(classifyStatus(dep, registryData)).toBe('update_available_breaking');
  });

  it('keeps an in-range ^0.y.z upgrade safe', () => {
    const registryData: RegistryStatusData = { latestStable: '0.2.9' };
    const dep = makeDep({ locked: '0.2.5', requested: '^0.2.3' });
    expect(classifyStatus(dep, registryData)).toBe('update_available_safe');
  });
});

const classify = (requested: string, locked: string, latestStable: string) =>
  classifyStatus(makeDep({ requested, locked }), { latestStable });

// A pin spelled with an operator — Python's `==2.31.0`, the requirements.txt
// norm — is the same manifest statement as a bare `2.31.0`. It used to read as
// a "complex constraint, assume safe", so a major bump looked safe.
describe('classifyStatus — operator-spelled exact pins', () => {
  it.each([
    ['==2.31.0', '2.31.0', '3.0.0', 'update_available_breaking'],
    ['== 2.31.0', '2.31.0', '3.0.0', 'update_available_breaking'],
    ['=1.2.3', '1.2.3', '2.0.0', 'update_available_breaking'],
    ['==0.8.5', '0.8.5', '0.9.0', 'update_available_breaking'],
    ['==2.31.0', '2.31.0', '2.32.3', 'update_available_safe'],
    // A wildcard pin is still not "simple": unchanged conservative answer.
    ['==2.*', '2.31.0', '3.0.0', 'update_available_safe'],
  ])('%s: %s → %s is %s', (requested, locked, latest, expected) => {
    expect(classify(requested, locked, latest)).toBe(expected);
  });
});

// An explicit upper bound is the author's own compatibility statement, so it
// decides — not the major-version heuristic. `>=2.0,<2.32` (PEP 440) used to
// call 2.31.0 → 2.32.3 safe because the major did not change.
describe('classifyStatus — declared upper bounds', () => {
  it.each([
    ['>=2.0,<2.32', '2.31.0', '2.32.3', 'update_available_breaking'],
    ['>=2.0,<2.32', '2.31.0', '2.31.9', 'update_available_safe'],
    ['>=2.0, <2.32', '2.31.0', '2.32.0', 'update_available_breaking'],
    ['>=1.0.0 <2.0.0', '1.2.0', '2.0.0', 'update_available_breaking'],
    ['< 2.0.0', '1.0.0', '2.0.0', 'update_available_breaking'],
    // A wide range allows a major bump the heuristic alone would flag.
    ['>=1.0,<3.0', '1.5.0', '2.1.0', 'update_available_safe'],
    // `<=` includes the bound itself.
    ['<=2.32', '2.31.0', '2.32.0', 'update_available_safe'],
    ['<=2.32', '2.31.0', '2.32.1', 'update_available_breaking'],
    // A bare upper bound is now a recognised constraint.
    ['<3', '2.1.0', '3.0.0', 'update_available_breaking'],
    ['<3', '2.1.0', '2.9.0', 'update_available_safe'],
    // npm's "below the next major prerelease" idiom.
    ['<3.0.0-0', '2.9.0', '3.0.0', 'update_available_breaking'],
  ])('%s: %s → %s is %s', (requested, locked, latest, expected) => {
    expect(classify(requested, locked, latest)).toBe(expected);
  });

  it('leaves an OR-range to the heuristic: one clause bound does not bind the others', () => {
    expect(classify('^1.2.0 || ^2.0.0', '1.2.0', '2.1.0')).toBe('update_available_breaking');
  });

  it('leaves a lower-bound-only range to the heuristic', () => {
    expect(classify('>=2.0', '2.31.0', '2.32.0')).toBe('update_available_safe');
    expect(classify('>=2.0', '2.31.0', '3.0.0')).toBe('update_available_breaking');
  });
});

// npm hyphen ranges: `A - B` is `>=A <=B`, and a partial B rounds up
// (`1.2.3 - 2.3` is `<2.4.0-0`). Expected values are npm semver 7.7.4's
// `satisfies(latest, range)`. Starting with a version, the range used to be
// judged as an exact pin by the major-version heuristic.
describe('classifyStatus — npm hyphen ranges', () => {
  it.each([
    ['1.2.3 - 1.4', '1.3.0', '1.5.0', 'update_available_breaking'],
    ['1.2.3 - 1.4.2', '1.3.0', '1.4.3', 'update_available_breaking'],
    ['1.2.3 - 1.4.2', '1.3.0', '1.4.2', 'update_available_safe'],
    ['1.2.3 - 2.3', '1.5.0', '2.3.9', 'update_available_safe'],
    ['1.2.3 - 2.3', '1.5.0', '2.4.0', 'update_available_breaking'],
    ['1 - 2', '1.2.3', '2.9.9', 'update_available_safe'],
    ['1 - 2', '1.2.3', '3.0.0', 'update_available_breaking'],
    ['1.2 - 1.8', '1.3.0', '1.9.0', 'update_available_breaking'],
    ['v1.0.0 - v1.9.9', '1.2.3', '2.0.0', 'update_available_breaking'],
  ])('%s: %s → %s is %s', (requested, locked, latest, expected) => {
    expect(classify(requested, locked, latest)).toBe(expected);
  });

  it('does not read a prerelease dash as a hyphen range', () => {
    expect(classify('1.2.3-beta', '1.2.3-beta', '1.2.3')).toBe('update_available_safe');
  });
});

// A PARTIAL inclusive bound is ecosystem-specific: npm (semver 7.7.4) and Cargo
// (real cargo 1.93 resolves `itoa = "<=1.0"` to 1.0.18) read `<=2.32` as the
// whole 2.32 line; PEP 440 (pip 26.2.1 packaging) excludes 2.32.1.
describe('classifyStatus — partial inclusive bounds per ecosystem', () => {
  const inEcosystem = (ecosystem: string, requested: string, locked: string, latest: string) =>
    classifyStatus(makeDep({ requested, locked, ecosystem }), { latestStable: latest });

  it.each([
    ['npm', '<=2.32', '2.31.0', '2.32.1', 'update_available_safe'],
    ['npm', '<=2.32', '2.31.0', '2.33.0', 'update_available_breaking'],
    ['npm', '<=2', '1.0.0', '2.33.0', 'update_available_safe'],
    ['npm', '<=2', '1.0.0', '3.0.0', 'update_available_breaking'],
    ['rust', '<=1.0', '1.0.0', '1.0.18', 'update_available_safe'],
    ['rust', '<=1.0', '1.0.0', '1.1.0', 'update_available_breaking'],
    ['python', '<=2.32', '2.31.0', '2.32.0', 'update_available_safe'],
    ['python', '<=2.32', '2.31.0', '2.32.1', 'update_available_breaking'],
    // A full version is inclusive everywhere.
    ['npm', '<=2.32.0', '2.31.0', '2.32.1', 'update_available_breaking'],
  ])('%s %s: %s → %s is %s', (ecosystem, requested, locked, latest, expected) => {
    expect(inEcosystem(ecosystem, requested, locked, latest)).toBe(expected);
  });

  it('keeps the literal reading when the ecosystem is unknown', () => {
    expect(classify('<=2.32', '2.31.0', '2.32.1')).toBe('update_available_breaking');
  });
});

// A tilde locks the component before the last one written: npm/cargo `~1` is
// <2.0.0 (semver 7.7.4), PEP 440 `~=2.31` is ==2.* (pip packaging). A fixed
// "minor locked" reading called updates these ranges admit breaking.
describe('classifyStatus — tilde precision', () => {
  it.each([
    ['~1', '1.0.0', '1.2.3', 'update_available_safe'],
    ['~1', '1.0.0', '2.0.0', 'update_available_breaking'],
    ['~1.2', '1.2.0', '1.3.0', 'update_available_breaking'],
    ['~1.2.3', '1.2.3', '1.2.9', 'update_available_safe'],
    ['~=2.31', '2.31.0', '2.32.3', 'update_available_safe'],
    ['~=2.31', '2.31.0', '3.0.0', 'update_available_breaking'],
    ['~=2.31.0', '2.31.0', '2.32.0', 'update_available_breaking'],
  ])('%s: %s → %s is %s', (requested, locked, latest, expected) => {
    expect(classify(requested, locked, latest)).toBe(expected);
  });
});

// ── Helper factory tests ───────────────────────────────────────────────────

describe('privateOrUnresolvedStatus', () => {
  it('creates status data with privateOrUnresolved flag', () => {
    const data = privateOrUnresolvedStatus('https://registry.example.org/pkg');
    expect(data.privateOrUnresolved).toBe(true);
    expect(data.lookupFailed).toBeUndefined();
    expect(data.evidence).toHaveLength(1);
    expect(data.evidence![0]!.kind).toBe('registry');
  });
});

describe('failedLookupStatus', () => {
  it('creates status data with lookupFailed flag', () => {
    const data = failedLookupStatus('https://registry.example.org/pkg', 'ECONNREFUSED');
    expect(data.lookupFailed).toBe(true);
    expect(data.privateOrUnresolved).toBeUndefined();
    expect(data.evidence).toHaveLength(1);
    expect(data.evidence![0]!.detail).toContain('ECONNREFUSED');
  });
});

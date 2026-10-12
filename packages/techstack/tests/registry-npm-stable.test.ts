import { describe, expect, it } from 'vitest';
import { classifyStatus } from '../src/policy/status.js';
import { parseNpmPackument } from '../src/registry/client.js';

describe('npm stable registry versions', () => {
  it('does not offer a prerelease as a stable upgrade', () => {
    const entry = parseNpmPackument(
      {
        'dist-tags': { latest: '2.0.0-beta.1' },
        versions: { '1.9.0': {}, '1.10.0': {}, '2.0.0-beta.1': {} },
      },
      'beta-tagged-package',
    );
    expect(entry.latestStable).toBe('1.10.0');
    expect(
      classifyStatus(
        {
          name: 'beta-tagged-package',
          sourceType: 'registry',
          locked: '1.10.0',
          requested: '^1.0.0',
          status: 'current',
        },
        entry,
      ),
    ).toBe('current');
  });

  it('honors a stable latest tag even when other published versions are higher', () => {
    const entry = parseNpmPackument(
      { 'dist-tags': { latest: '1.9.0' }, versions: { '1.9.0': {}, '2.0.0': {} } },
      'stable-tag',
    );
    expect(entry.latestStable).toBe('1.9.0');
  });

  it.each(['2.0.0-alpha.1', '2.0.0-rc.1', 'not-a-version'])('%s is not a stable tag', (latest) => {
    expect(
      parseNpmPackument(
        { 'dist-tags': { latest }, versions: { '1.0.0': {}, '1.2.0': {}, [latest]: {} } },
        'tagged',
      ).latestStable,
    ).toBe('1.2.0');
  });

  it('does not fabricate a stable release for a prerelease-only package', () => {
    expect(
      parseNpmPackument(
        { 'dist-tags': { latest: '1.0.0-beta.1' }, versions: { '1.0.0-beta.1': {} } },
        'preview-only',
      ).latestStable,
    ).toBeUndefined();
  });

  it('keeps sparse stable metadata and rejects sparse prerelease metadata', () => {
    expect(parseNpmPackument({ 'dist-tags': { latest: '1.0.0' } }, 'sparse').latestStable).toBe(
      '1.0.0',
    );
    expect(
      parseNpmPackument({ 'dist-tags': { latest: '1.0.0-beta.1' } }, 'sparse').latestStable,
    ).toBeUndefined();
  });

  it('accepts stable build metadata containing a hyphen', () => {
    expect(
      parseNpmPackument({ 'dist-tags': { latest: '1.2.3+build-one' } }, 'build-metadata')
        .latestStable,
    ).toBe('1.2.3+build-one');
  });

  it('finds a stable release when the latest tag is absent', () => {
    expect(
      parseNpmPackument({ versions: { '1.9.0': {}, '1.10.0': {}, '2.0.0-rc.1': {} } }, 'no-tag')
        .latestStable,
    ).toBe('1.10.0');
  });

  it('preserves deprecation based on the latest tag rather than an old release', () => {
    const entry = parseNpmPackument(
      {
        'dist-tags': { latest: '2.0.0-beta.1' },
        versions: { '1.0.0': {}, '2.0.0-beta.1': { deprecated: 'retired' } },
      },
      'deprecated-preview',
    );
    expect(entry.deprecated).toBe(true);
  });
});

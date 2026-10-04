import { configureSandboxPolicy, resetSandboxPolicy } from '@wrongstack/core/sandbox';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSafetyWorkEntries } from '../src/components/status-bar-rails.js';
import type { StatusBarRailBuildParams } from '../src/components/status-bar-rails-common.js';

// Plan 28 T9 — TUI statusline chip: the sandbox posture chip renders only
// while a tier is enforced, so the default (mode off) rail composition — and
// therefore the status-bar-rail-order pin — is unchanged.

afterEach(() => {
  resetSandboxPolicy();
});

const params = {
  showChip: () => true,
  isNoColor: true,
  chipDensity: () => 'auto',
} as unknown as StatusBarRailBuildParams;

describe('sandbox statusline chip (plan 28 T9)', () => {
  it('renders nothing while mode is off (default policy)', () => {
    const entries = buildSafetyWorkEntries(params);
    expect(entries.some((e) => e.id === 'sandbox')).toBe(false);
  });

  it('renders the tier chip with full + short levels under enforced policy', () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write' });
    const entries = buildSafetyWorkEntries(params);
    const chip = entries.find((e) => e.id === 'sandbox');
    expect(chip).toBeDefined();
    expect(chip?.node).toBeDefined();
    expect(chip?.alt?.length).toBe(1);
  });

  it('hides again when the policy resets to off', () => {
    configureSandboxPolicy({ mode: 'enforced', tier: 'workspace-write' });
    resetSandboxPolicy();
    const entries = buildSafetyWorkEntries(params);
    expect(entries.some((e) => e.id === 'sandbox')).toBe(false);
  });
});

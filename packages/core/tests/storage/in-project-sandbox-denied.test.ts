import { describe, expect, it } from 'vitest';
import { stripUnsafeInProjectFields } from '../../src/storage/config-loader/in-project-policy.js';

/**
 * Plan 28 T8: `tools.sandbox` splits in-project policy into benign leaves
 * (mode, tier — they can only tighten containment) and leaves that widen the
 * blast radius (backend selector; writableRoots host-path bind mounts).
 * The benign pair must survive `stripUnsafeInProjectFields`; the widening
 * pair must be stripped with the standard in-project warning.
 */
describe('in-project policy: tools.sandbox (plan 28 T8)', () => {
  it('keeps benign sandbox preferences (mode, tier) from the project config', () => {
    const warnings: string[] = [];
    const stripped = stripUnsafeInProjectFields(
      { tools: { sandbox: { mode: 'enforced', tier: 'workspace-write' } } } as never,
      '/repo/.wrongstack/config.json',
      (msg) => warnings.push(msg),
    );
    const tools = (stripped as Record<string, unknown>)['tools'] as Record<string, unknown>;
    expect(tools['sandbox']).toEqual({ mode: 'enforced', tier: 'workspace-write' });
  });

  it('strips the backend selector and writableRoots with the standard warning', () => {
    const warnings: string[] = [];
    const stripped = stripUnsafeInProjectFields(
      {
        tools: {
          sandbox: {
            mode: 'enforced',
            tier: 'workspace-write',
            backend: 'container',
            writableRoots: ['D:/elsewhere'],
          },
        },
      } as never,
      '/repo/.wrongstack/config.json',
      (msg) => warnings.push(msg),
    );
    const tools = (stripped as Record<string, unknown>)['tools'] as Record<string, unknown>;
    expect(tools['sandbox']).toEqual({ mode: 'enforced', tier: 'workspace-write' });
    const joined = warnings.join('\n');
    expect(joined).toContain('tools.sandbox.backend');
    expect(joined).toContain('tools.sandbox.writableRoots');
  });

  it('keeps the drift guard green with the sandbox classification', () => {
    // The first strip call in a process runs assertInProjectAllowListComplete;
    // a mis-classified path (orphaned/malformed/duplicate) would throw here.
    expect(() =>
      stripUnsafeInProjectFields(
        { tools: { sandbox: { mode: 'enforced', tier: 'read-only' } } } as never,
        '/repo/.wrongstack/config.json',
        () => {},
      ),
    ).not.toThrow();
  });
});

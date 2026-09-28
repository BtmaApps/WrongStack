import { applyProjectAgentConfig } from '@wrongstack/core/agent-catalog';
import { describe, expect, it } from 'vitest';
import { constrainMemoryCompanion } from '../../src/fleet/memory-companion-policy.js';

describe('Memory Companion role overrides', () => {
  it('reapplies read-only grants and hard ceilings after system-role widening', () => {
    const merged = applyProjectAgentConfig(
      { name: 'Memory Companion', tools: ['read'], allowedCapabilities: ['fs.read'] },
      {
        tools: ['bash', 'memory_update', 'session_note'],
        allowedCapabilities: ['fs.write', 'session.note'],
        budget: {
          maxIterations: 9000,
          maxToolCalls: 9000,
          maxTokens: 999999,
          maxCostUsd: 100,
          timeoutMs: 3600000,
        },
      },
      { protectSystemRole: true },
    );
    expect(merged.tools).toContain('memory_update');
    const limited = constrainMemoryCompanion(merged);
    expect(limited.allowedCapabilities).toEqual(['fs.read']);
    expect(limited.tools).not.toContain('memory_update');
    expect(limited.tools).not.toContain('session_note');
    expect(limited).toMatchObject({
      maxIterations: 8,
      maxToolCalls: 12,
      maxTokens: 12000,
      maxCostUsd: 0.15,
      timeoutMs: 60000,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildSandboxCommand } from '../src/slash-commands/sandbox.js';

const cmd = buildSandboxCommand({} as never);

describe('/sandbox (plan 28 T3 active-tier indicator)', () => {
  it('registers with stable metadata', () => {
    expect(cmd.name).toBe('sandbox');
    expect(cmd.description.length).toBeGreaterThan(0);
    expect(cmd.help?.length ?? 0).toBeGreaterThan(0);
  });

  it('reports the resolved sandbox policy', async () => {
    const result = (await cmd.run('', undefined as never)) as { message?: string };
    const message = result.message ?? '';
    expect(message).toContain('mode');
    expect(message).toContain('off');
    expect(message).toContain('tier');
    expect(message).toContain('backend');
  });

  it('supports the --audit tail', async () => {
    const result = (await cmd.run('--audit', undefined as never)) as { message?: string };
    expect(result.message ?? '').toContain('Audit');
  });
});

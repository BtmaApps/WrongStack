import { describe, expect, it, vi } from 'vitest';
import type { SubcommandDeps } from '../../src/subcommands/contracts.js';
import { modeldiagCmd } from '../../src/subcommands/handlers/modeldiag.js';

describe('modeldiag preflight entry point', () => {
  it('runs before reading a model cache and keeps configured secrets out of output', async () => {
    const write = vi.fn();
    const deps = {
      renderer: { write },
      config: {
        providers: {
          'team-azure': {
            type: 'azure',
            baseUrl: 'https://example.invalid/openai',
            apiKey: 'fixture-private-key',
          },
        },
      },
      paths: {},
    } as unknown as SubcommandDeps;
    expect(await modeldiagCmd(['preflight', 'team-azure'], deps)).toBe(0);
    const text = write.mock.calls.map(([value]) => value).join('');
    expect(text).toContain('configuration presence only');
    expect(text).not.toContain('fixture-private-key');
  });
  it('reports an unknown configured profile without requiring a model cache', async () => {
    const write = vi.fn();
    const deps = {
      renderer: { write },
      config: { providers: {} },
      paths: {},
    } as unknown as SubcommandDeps;
    expect(await modeldiagCmd(['preflight', 'unknown'], deps)).toBe(1);
    expect(write.mock.calls.map(([value]) => value).join('')).toContain('not configured');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLI provider picker live config wiring', () => {
  it('reads provider options from ConfigStore instead of the boot-time config snapshot', () => {
    const source = readFileSync(
      new URL('../src/wiring/cli-execute-builder.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('getPickableProviders: createPickableProvidersLoader({');
    const pickerWiring = source.slice(start, source.indexOf('switchProviderAndModel,', start));

    expect(pickerWiring).toContain('getConfig: () => configStore.get()');
    expect(pickerWiring).not.toContain('getConfig: () => config,');
  });
});

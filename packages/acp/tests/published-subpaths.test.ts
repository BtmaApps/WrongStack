import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, { import: string; types: string }>;
};

describe('@wrongstack/acp published subpaths', () => {
  it('publishes distinct implementation, v1, SDK, and legacy contracts', () => {
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './agent',
      './client',
      './legacy',
      './sdk',
      './sdk/unstable',
      './v1',
    ]);
  });

  it('points every export at built JavaScript and declaration files', () => {
    const missing: string[] = [];
    for (const [subpath, entry] of Object.entries(packageJson.exports)) {
      for (const target of [entry.import, entry.types]) {
        if (!fs.existsSync(path.resolve(packageRoot, target)))
          missing.push(`${subpath} -> ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('resolves every authority through Node package exports', async () => {
    const root = await import('@wrongstack/acp');
    const v1 = await import('@wrongstack/acp/v1');
    const sdk = await import('@wrongstack/acp/sdk');
    const unstable = await import('@wrongstack/acp/sdk/unstable');
    const legacy = await import('@wrongstack/acp/legacy');

    expect(root.ACP_PROTOCOL_VERSION).toBe(1);
    expect(v1.ACP_PROTOCOL_VERSION).toBe(1);
    expect(sdk.AcpServer).toBeDefined();
    expect(unstable.PROTOCOL_VERSION).toBe(1);
    expect(unstable.client).toBeTypeOf('function');
    expect(unstable.createWebSocketStream).toBe(sdk.createWebSocketStream);
    expect(legacy.LEGACY_ACP_CONTRACT_VERSION).toBe('pre-v1-draft');
  });
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProviderSnapshot } from '../../src/storage/provider-config-watcher.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(path.resolve(root).startsWith(path.join(os.tmpdir(), 'wrongstack-config-shape-'))).toBe(
      true,
    );
    await fs.rm(root, { recursive: true, force: true });
  }
});
describe('provider config snapshot root shape', () => {
  it.each([null, [], false, 42, 'bad'].map((value) => [value]))(
    'ignores a non-object config root (%j)',
    async (value) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-config-shape-'));
      roots.push(root);
      const config = path.join(root, 'config.json');
      const warn = vi.fn();
      await fs.writeFile(config, JSON.stringify(value));
      await expect(readProviderSnapshot(config, {} as never, warn)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('must be a JSON object'));
      await fs.writeFile(config, '{"uiLocale":"tr"}');
      await expect(readProviderSnapshot(config, {} as never)).resolves.toMatchObject({
        uiLocale: 'tr',
        providers: {},
      });
    },
  );
});

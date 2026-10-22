import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rewriteConfigEncrypted } from '../../src/security/secret-vault-config.js';

describe('rewriteConfigEncrypted existing config safety', () => {
  it('rejects malformed JSON and preserves the original file', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.temp_files', 'vault-invalid-'));
    const config = path.join(root, 'config.json');
    const original = '{ "providers": { broken json';
    await mkdir(root, { recursive: true });
    await writeFile(config, original);
    const vault = {
      encrypt: (value: string) => `enc:v1:${value}`,
      decrypt: (value: string) => value,
      isEncrypted: (value: string) => value.startsWith('enc:'),
      keyVersion: 1,
    };

    await expect(
      rewriteConfigEncrypted(config, vault, { apiKey: 'replacement' }),
    ).rejects.toBeInstanceOf(SyntaxError);
    await expect(readFile(config, 'utf8')).resolves.toBe(original);
  });
});

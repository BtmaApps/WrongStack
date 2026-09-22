import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppendedSystemPrompt } from '../src/boot/append-system-prompt.js';

describe('resolveAppendedSystemPrompt', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-append-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns undefined when neither flag carries text', async () => {
    await expect(resolveAppendedSystemPrompt({}, tmp)).resolves.toBeUndefined();
    await expect(
      resolveAppendedSystemPrompt({ 'append-system-prompt': '   ' }, tmp),
    ).resolves.toBeUndefined();
  });

  it('joins inline text before file contents, resolving the file against cwd', async () => {
    await fs.writeFile(path.join(tmp, 'extra.md'), 'From the file.\n');
    await expect(
      resolveAppendedSystemPrompt(
        { 'append-system-prompt': 'Inline rule.', 'append-system-prompt-file': 'extra.md' },
        tmp,
      ),
    ).resolves.toBe('Inline rule.\n\nFrom the file.');
  });

  it('fails loudly on an unreadable file instead of dropping the instructions', async () => {
    await expect(
      resolveAppendedSystemPrompt({ 'append-system-prompt-file': 'missing.md' }, tmp),
    ).rejects.toThrow(/cannot read .*missing\.md \(ENOENT\)/);
  });

  it('rejects a bare file flag with no path', async () => {
    await expect(
      resolveAppendedSystemPrompt({ 'append-system-prompt-file': true }, tmp),
    ).rejects.toThrow(/needs a path/);
  });
});

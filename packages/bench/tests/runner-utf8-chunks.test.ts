/**
 * runWstack decoded each stdout Buffer on its own, so a multibyte character
 * split between two pipe reads turned into U+FFFD pairs inside the graded
 * `finalText`. The fake CLI writes its `--output-json` line in two parts that
 * split a character, with a pause so the runner reads them separately.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runWstack } from '../src/runner.js';

let dir = '';
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe('runWstack stdout decoding', () => {
  it('keeps a finalText character that straddles two pipe reads intact', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-utf8-'));
    const finalText = 'Cevap: çözüm doğru 😀';
    const fake = path.join(dir, 'fake-wstack.cjs');
    await fs.writeFile(
      fake,
      [
        `const line = Buffer.from(JSON.stringify({ status: 'completed', finalText: ${JSON.stringify(finalText)} }) + '\\n');`,
        // one byte into the 4-byte emoji
        "const cut = line.indexOf(Buffer.from('😀')) + 1;",
        'process.stdout.write(line.subarray(0, cut));',
        "process.stderr.write(Buffer.from('ş').subarray(0, 1));",
        'setTimeout(() => {',
        '  process.stdout.write(line.subarray(cut));',
        "  process.stderr.write(Buffer.from('ş').subarray(1));",
        '}, 100);',
      ].join('\n'),
    );
    const run = await runWstack({
      nodeBin: process.execPath,
      wstackEntry: fake,
      homeDir: dir,
      workdir: dir,
      cell: { provider: 'p', model: 'm' } as never,
      prompt: 'x',
      timeoutMs: 20_000,
    });
    expect(run.status).toBe('completed');
    expect(run.finalText).toBe(finalText);
  });
});

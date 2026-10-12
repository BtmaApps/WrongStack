import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeDeadCode, applyDeadCodeFixes, undoDeadCodeFix } from '../src/dead-code/index.js';

// The fixer rewrites and backs up files from a UTF-8 decode. A legacy
// single-byte file (here ISO-8859-9: "ü" is the lone byte 0xFC) would come back
// with U+FFFD in place of every non-ASCII byte, and `undo` would "restore" the
// corrupted text. Such files must be skipped, not rewritten.

let base: string;
let prevHome: string | undefined;

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-deadcode-utf8-'));
  prevHome = process.env.WRONGSTACK_HOME;
  process.env.WRONGSTACK_HOME = path.join(base, 'home');
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.WRONGSTACK_HOME;
  else process.env.WRONGSTACK_HOME = prevHome;
  fs.rmSync(base, { recursive: true, force: true });
});

const DECLS =
  '\nexport function helper(): void {}\n\nexport function deadFn(): number {\n  return 1;\n}\n';

function project(label: string, helper: Buffer): string {
  const root = path.join(base, label);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: label, private: true, main: './dist/main.js' }),
  );
  fs.writeFileSync(
    path.join(root, 'src/main.ts'),
    "import { helper } from './helper.js';\nhelper();\n",
  );
  fs.writeFileSync(path.join(root, 'src/helper.ts'), helper);
  return root;
}

async function fixDeadFn(root: string) {
  const r = await analyzeDeadCode(root, { noCache: true });
  const dead = r.findings.find((f) => f.file === 'src/helper.ts' && f.name === 'deadFn');
  expect(dead).toBeDefined();
  return { id: dead!.id, res: await applyDeadCodeFixes(root, [dead!.id], { verify: 'none' }) };
}

describe('dead-code fix — source encoding', () => {
  it('skips a legacy-encoded file instead of rewriting its non-ASCII bytes', async () => {
    const legacy = Buffer.concat([Buffer.from('// G\xfcncel', 'latin1'), Buffer.from(DECLS)]);
    const root = project('legacy', legacy);
    const { id, res } = await fixDeadFn(root);
    expect(fs.readFileSync(path.join(root, 'src/helper.ts'))).toEqual(legacy);
    expect(res.plan.skipped).toEqual([{ id, reason: expect.stringMatching(/Not UTF-8 text/) }]);
  });

  it('still fixes a UTF-8 file, and undo restores it byte for byte', async () => {
    const utf8 = Buffer.from(`// Güncel${DECLS}`, 'utf8');
    const root = project('utf8', utf8);
    const { res } = await fixDeadFn(root);
    const after = fs.readFileSync(path.join(root, 'src/helper.ts'), 'utf8');
    expect(after).toContain('// Güncel');
    expect(after).not.toContain('deadFn');
    undoDeadCodeFix(root, res.backupId!);
    expect(fs.readFileSync(path.join(root, 'src/helper.ts'))).toEqual(utf8);
  });
});

/**
 * `.design/` is self-ignored only when WrongStack creates it; a cloned repo
 * can commit it — and `PRODUCT.md` — as symlinks. Followed, `rules.md` put any
 * host file into the system prompt and a kit choice overwrote the target of
 * `active.json`. Links inside the project still work.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  insideDesignProject,
  loadProjectDesignRules,
  recordKitChoice,
} from '../../src/execution/design-project-store.js';

let base = '';
let root = '';
beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'design-link-')));
  root = path.join(base, 'repo');
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  fs.writeFileSync(path.join(base, 'outside.txt'), 'OUTSIDE\n');
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('design store behind symlinks', () => {
  it('does not read rules from a link that leaves the project', async () => {
    fs.symlinkSync(path.join(base, 'outside.txt'), path.join(root, '.design', 'rules.md'), 'file');
    expect(await loadProjectDesignRules(root)).toBeUndefined();
    fs.symlinkSync(path.join(base, 'outside.txt'), path.join(root, 'PRODUCT.md'), 'file');
    expect(await insideDesignProject(root, path.join(root, 'PRODUCT.md'))).toBe(false);
  });

  it('does not write a kit choice through a link that leaves the project', async () => {
    fs.symlinkSync(
      path.join(base, 'outside.txt'),
      path.join(root, '.design', 'active.json'),
      'file',
    );
    await recordKitChoice(root, 'kit', 'react', 'test', '2026-10-27T00:00:00Z');
    expect(fs.readFileSync(path.join(base, 'outside.txt'), 'utf8')).toBe('OUTSIDE\n');
  });

  it('keeps following a link inside the project', async () => {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'rules.md'), 'Use an 8px grid.');
    fs.symlinkSync(
      path.join(root, 'docs', 'rules.md'),
      path.join(root, '.design', 'rules.md'),
      'file',
    );
    expect(await loadProjectDesignRules(root)).toBe('Use an 8px grid.');
  });
});

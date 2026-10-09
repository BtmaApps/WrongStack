/**
 * The English and Turkish eval sets must stay 1:1.
 *
 * Their whole purpose is that the DELTA between the two runs is the language
 * effect and nothing else. The moment one file gains a case, loses one, or has
 * a label corrected on its own, the two numbers stop being comparable — and
 * nothing about the output would look wrong. A sweep table on a drifted pair
 * still renders, still looks precise, and no longer means what it says.
 *
 * This is also the only check on the files at all: they are data, not code, so
 * a malformed line would otherwise be found by an eval run that has already
 * spent money.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvalJsonl, parseSkillFrontmatter } from '@wrongstack/core/skills';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PAIRS = [
  ['.wrongstack/skill-suggest-eval.jsonl', '.wrongstack/skill-suggest-eval-tr.jsonl'],
  [
    'packages/core/tests/fixtures/skill-suggest-bundle-en.jsonl',
    'packages/core/tests/fixtures/skill-suggest-bundle-tr.jsonl',
  ],
].map((pair) => pair.map((file) => path.join(REPO_ROOT, file)));

function load(file: string) {
  return parseEvalJsonl(fs.readFileSync(file, 'utf8'));
}

describe.each(PAIRS)('skill-suggest eval fixtures %s / %s', (EN, TR) => {
  it('labels only current bundled skills visible to the main agent', () => {
    const root = path.join(REPO_ROOT, 'packages/core/skills');
    const visible = new Set(
      fs.readdirSync(root).flatMap((name) => {
        const file = path.join(root, name, 'SKILL.md');
        if (!fs.existsSync(file)) return [];
        const parsed = parseSkillFrontmatter(fs.readFileSync(file, 'utf8'));
        return ['roster', 'external'].includes(parsed.audience?.trim().toLowerCase() ?? '')
          ? []
          : [parsed.name];
      }),
    );
    for (const request of load(EN).requests) {
      if (request.gold) expect(visible.has(request.gold), request.text).toBe(true);
    }
  });
  it('parse without malformed lines', () => {
    for (const file of [EN, TR]) {
      const { requests, errors } = load(file);
      expect({ file: path.basename(file), errors }).toEqual({
        file: path.basename(file),
        errors: [],
      });
      expect(requests.length).toBeGreaterThan(0);
    }
  });

  it('carry the same labels in the same order', () => {
    const en = load(EN).requests;
    const tr = load(TR).requests;
    expect(tr.length).toBe(en.length);
    // Compared as a sequence, not a set: the pairing is positional, so a
    // reordered file would pass a set comparison while pairing every Turkish
    // case with the wrong English one.
    expect(tr.map((r) => r.gold ?? null)).toEqual(en.map((r) => r.gold ?? null));
  });

  it('keep enough uncovered cases to measure the failure that actually happens', () => {
    // A set made only of covered requests scores ~90% and says nothing: the
    // real failure mode is suggesting something on turns nothing covers.
    for (const file of [EN, TR]) {
      const requests = load(file).requests;
      const uncovered = requests.filter((r) => !r.gold).length;
      expect(uncovered / requests.length).toBeGreaterThan(0.2);
    }
  });

  it('contain no duplicate request text, which would double-count a case', () => {
    for (const file of [EN, TR]) {
      const texts = load(file).requests.map((r) => r.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('are actually in different languages', () => {
    // Cheap but sufficient: a Turkish file with no Turkish-specific letters is
    // almost certainly the English one copied, which is exactly the mistake
    // that would make the delta read as zero.
    const tr = load(TR)
      .requests.map((r) => r.text)
      .join(' ');
    expect(/[çğıöşüÇĞİÖŞÜ]/.test(tr)).toBe(true);
  });
});

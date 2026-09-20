/**
 * Architecture guard: secret redaction has exactly ONE pattern list.
 *
 * The redactor used to exist as three hand-mirrored copies (tools, core
 * observability, telegram) whose "keep these two copies in sync" comments were
 * the entire enforcement mechanism. That contract failed twice, both times in
 * the leak direction — a `:`-precedence branch printed a value's prefix
 * verbatim, and the pattern set drifted so `-a`/PASSPHRASE were missed — and
 * only the second was noticed because it happened to have a test.
 *
 * The implementation now lives in `packages/primitives/src/redact-command.ts`
 * and the three former copies are re-export shims. This test fails if a fourth
 * pattern list appears anywhere else, which is the realistic way the drift
 * returns: someone needs "just one" extra pattern and copies the alternation
 * instead of adding it to the canonical list.
 *
 * The needles below are the flag-INTRODUCTION shapes a secret-flag list cannot
 * avoid (a long-flag alternation, an env-var name alternation, a high-entropy
 * flag-name alternation, and the two short-flag alternations). They were tuned
 * against the whole tree: 7,903 source files scanned and only the canonical
 * module matched, so this does not fire on unrelated `--(?:...)` option parsers
 * or on credential scanners that alternate over words like `secret`/`credential`
 * without being flag lists.
 */
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Module-relative so the suite passes from any vitest root (the package test
// script runs vitest with --root ../.. from this directory).
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const CANONICAL_RELATIVE = 'packages/primitives/src/redact-command.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  // Shared bug-hunt / release scratch: not workspace source, owned by other
  // processes, and deliberately allowed to hold throwaway copies.
  '.temp_files',
  'coverage',
  '.cache',
  'build',
]);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];

// The alternations are assembled from fragments ON PURPOSE: writing them as
// literals would make this file match its own needles, which would force a
// self-exclusion and hide a real offender added here.
//
// The pipes are ESCAPED (`\|`) wherever the original alternation mixes long
// keywords with single letters. Letting `|` bind as a real alternation would
// make the short-flag needle match only its two-letter prefix, which appears in
// unrelated option parsers; the literal spelling is what only a copied pattern
// list contains. These five needles were validated against the whole tree
// (7,903 source files scanned, only the canonical module matched), so this
// guard is a copy-paste tripwire rather than a proof: it catches the realistic
// way the list returns, not a deliberately reworded rewrite.
//
// Do NOT write a needle's own spelling in prose anywhere in this file — the
// first version of this comment contained one and the guard correctly flagged
// its own source. Refer to them by label instead.
const FLAG_KEYWORDS = ['token', 'password', 'passwd', 'pwd', 'secret'];
const ENV_KEYWORDS = ['TOKEN', 'API_KEY'];
const HIGH_ENTROPY_KEYWORDS = ['token', 'key', 'secret'];
const SHORT_SECRET_KEYWORDS = ['password', 'p', 'a'];
const LITERAL_PIPE = String.raw`\|`;

const SIGNATURES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: 'long-flag / bare-long-flag keyword alternation',
    pattern: new RegExp(String.raw`--\(\?[^)]*\b(?:${FLAG_KEYWORDS.join('|')})\b`, 'i'),
  },
  {
    label: 'env-var name alternation',
    pattern: new RegExp(String.raw`\(\?:${ENV_KEYWORDS.join(LITERAL_PIPE)}\b`),
  },
  {
    label: 'high-entropy flag-name alternation',
    pattern: new RegExp(String.raw`--\\w*\(\?:${HIGH_ENTROPY_KEYWORDS.join(LITERAL_PIPE)}`),
  },
  {
    label: 'short-flag secret alternation',
    pattern: new RegExp(String.raw`-\(\?:${SHORT_SECRET_KEYWORDS.join(LITERAL_PIPE)}`),
  },
  {
    label: 'short-flag token alternation',
    pattern: new RegExp(String.raw`-t\(\?:\[=\\s\]\+\)\?\[\^\\s,-\]\{8,\}`),
  },
];

async function sourceFiles(dir: string): Promise<string[]> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await sourceFiles(absolute)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(absolute);
    }
  }
  return out;
}

describe('secret redaction is single-source', () => {
  it('has no pattern list outside packages/primitives/src/redact-command.ts', async () => {
    const files = await sourceFiles(REPO_ROOT);
    // A walk that found nothing means the root or the skip list is wrong; that
    // is a setup failure, not a passing guard.
    expect(files.length).toBeGreaterThan(1000);

    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(REPO_ROOT, file).replaceAll('\\', '/');
      if (relative === CANONICAL_RELATIVE) continue;
      const source = await fs.readFile(file, 'utf8');
      const hit = SIGNATURES.find(({ pattern }) => pattern.test(source));
      if (hit) offenders.push(`${relative} [${hit.label}]`);
    }

    expect(offenders, 'move the pattern into the canonical module instead of copying it').toEqual(
      [],
    );
  });

  it('still recognises the canonical module (guards against a vacuous pass)', async () => {
    const source = await fs.readFile(path.join(REPO_ROOT, CANONICAL_RELATIVE), 'utf8');
    const matched = SIGNATURES.filter(({ pattern }) => pattern.test(source)).map((s) => s.label);
    // If the canonical module is renamed or its patterns are reformatted past
    // recognition, the guard above would pass for the wrong reason.
    expect(matched.length).toBeGreaterThanOrEqual(SIGNATURES.length - 1);
    // Both profiles must be built from one shared set rather than re-declaring
    // their own short-flag patterns (the exact divergence that leaked).
    expect(source).toContain('SHORT_FLAG_TOKEN_PATTERN');
    expect(source).toContain('SHORT_FLAG_SECRET_PATTERN');
  });
});

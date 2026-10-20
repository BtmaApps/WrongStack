/**
 * Lexical signals behind the Skill Companion judge.
 *
 * Candidates are ranked by how many work terms (request, open todos, edited
 * paths) appear in their name or description, so the `maxCandidates` cut
 * keeps the relevant ones instead of catalog order, and the judge sees which
 * terms overlapped. Declared `paths` matching lives in core
 * (skills/skill-path-rules.ts) because the tool executor applies it.
 *
 * Overlap is evidence for ordering, never a pick on its own: a request in
 * another language overlaps nothing and must still reach the judge.
 *
 * @module skill-companion-signals
 */

import { normalizeSkillRequest } from '@wrongstack/core/skills';
import type { SkillCandidate } from './skill-companion-policy.js';

const MAX_MATCH_TERMS = 4;
const NAME_WEIGHT = 3;

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'into',
  'when',
  'use',
  'using',
  'used',
  'not',
  'are',
  'was',
  'you',
  'your',
  'can',
  'should',
  'will',
  'all',
  'any',
  'new',
  'one',
  'also',
  'only',
  'more',
  'than',
  'then',
  'them',
  'they',
  'its',
  'our',
  'out',
  'via',
  'but',
  'how',
  'what',
  'which',
  'who',
  'why',
  'like',
  'make',
  'please',
  'need',
  'want',
  'have',
  'has',
  'had',
  'get',
  'set',
  'add',
  'run',
  'see',
  'now',
  'just',
  'some',
  'each',
  'other',
  'skill',
  'skills',
  'file',
  'files',
  'code',
  'work',
  'task',
  'tasks',
  'src',
  'lib',
  'packages',
  'index',
  'main',
  'dist',
  'bir',
  'bu',
  'ile',
  'icin',
  'olan',
  'gibi',
  'daha',
  've',
  'ama',
  'cok',
  'hem',
  'sonra',
  'once',
  'kadar',
  'yeni',
]);

/** Short terms that carry meaning on their own. */
const SHORT_TERMS = new Set([
  'ui',
  'ux',
  'ci',
  'cd',
  '3d',
  'ai',
  'db',
  'qa',
  'go',
  'pr',
  'js',
  'ts',
]);

/** Extensions name their ecosystem; the file path rarely says it in words. */
const EXTENSION_TERMS: Readonly<Record<string, readonly string[]>> = {
  tsx: ['react', 'component'],
  jsx: ['react', 'component'],
  ts: ['typescript'],
  py: ['python'],
  go: ['go'],
  rs: ['rust'],
  css: ['css', 'style'],
  scss: ['css', 'style'],
  sql: ['sql', 'database'],
  prisma: ['prisma', 'database'],
  md: ['markdown', 'docs'],
  docx: ['docx', 'word'],
  xlsx: ['xlsx', 'excel', 'spreadsheet'],
  pptx: ['pptx', 'slides', 'presentation'],
  pdf: ['pdf'],
  glsl: ['shader', 'webgl'],
  wgsl: ['shader', 'webgpu'],
  vue: ['vue'],
  svelte: ['svelte'],
};

function stem(word: string): string {
  if (word.length >= 6) return word.replace(/(?:ing|ed|s)$/, '');
  if (word.length >= 4) return word.replace(/s$/, '');
  return word;
}

function words(text: string): string[] {
  return normalizeSkillRequest(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 3 || SHORT_TERMS.has(w)) && !STOP_WORDS.has(w));
}

/** Work terms keyed by stem, each with the first spelling seen (shown to the judge). */
export function workTerms(texts: readonly string[], files: readonly string[]): Map<string, string> {
  const terms = new Map<string, string>();
  const add = (word: string) => {
    const key = stem(word);
    if (!terms.has(key)) terms.set(key, word);
  };
  for (const text of texts) for (const word of words(text)) add(word);
  for (const file of files) {
    for (const word of words(file.replace(/\\/g, '/'))) add(word);
    const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase();
    for (const word of (ext && EXTENSION_TERMS[ext]) || []) add(word);
  }
  return terms;
}

/** A coarse "kind of file" so a shift from app code to tests or infra re-probes. */
export function fileFamily(file: string): string | undefined {
  const base = file.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  if (!base) return undefined;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(base) || /_test\.(?:go|py)$/.test(base)) return 'test';
  if (base === 'dockerfile' || base.startsWith('docker-compose')) return 'docker';
  if (base.startsWith('wrangler.')) return 'wrangler';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : base;
}

/** The files a successful change touched, from the executor's targets or the input. */
export function editedPaths(input: unknown, writeTargets: readonly string[] | undefined): string[] {
  if (writeTargets?.length) return [...writeTargets];
  const record = (input ?? {}) as Record<string, unknown>;
  for (const key of ['path', 'file_path', 'file']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return [value];
  }
  return [];
}

/**
 * Order candidates by overlap with the work, best first, keeping catalog order
 * among equals, and cut to `max`. A candidate with overlap carries `match`.
 */
export function rankSkillCandidates(
  candidates: readonly SkillCandidate[],
  terms: ReadonlyMap<string, string>,
  max: number,
): SkillCandidate[] {
  const scored = candidates.map((candidate, index) => {
    const { score, match } = skillOverlap(candidate, terms);
    return { candidate: match.length ? { ...candidate, match } : candidate, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, max).map((entry) => entry.candidate);
}

/**
 * How strongly one candidate overlaps the work: a term in the name counts
 * `NAME_WEIGHT`, one only in the description counts 1. `match` lists the
 * overlapping terms, name hits first.
 */
export function skillOverlap(
  candidate: SkillCandidate,
  terms: ReadonlyMap<string, string>,
): { score: number; match: string[] } {
  const name = new Set(words(candidate.name.replace(/-/g, ' ')).map(stem));
  const description = new Set(words(candidate.description).map(stem));
  let score = 0;
  const nameHits: string[] = [];
  const descriptionHits: string[] = [];
  for (const [key, spelling] of terms) {
    if (name.has(key)) {
      score += NAME_WEIGHT;
      nameHits.push(spelling);
    } else if (description.has(key)) {
      score += 1;
      descriptionHits.push(spelling);
    }
  }
  return { score, match: [...nameHits, ...descriptionHits].slice(0, MAX_MATCH_TERMS) };
}

/**
 * What the judge would see as lexical evidence. Empty when nothing overlaps,
 * so a request the ranker cannot read is never treated as "seen before".
 */
export function evidenceSignature(candidates: readonly SkillCandidate[]): string {
  return candidates
    .filter((candidate) => candidate.match?.length)
    .map((candidate) => `${candidate.name}:${candidate.match!.join(',')}`)
    .sort()
    .join('|');
}

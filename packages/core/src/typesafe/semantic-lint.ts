/**
 * Semantic convention lint over a diff: code finds candidates, System One
 * judges them.
 *
 * Some project conventions cannot be a regex. "A tool must throw, not return
 * `{ status: 'error' }`" matches a regex on the payload, but the same literal
 * in a parser test or a protocol type is fine; "never assign to the live
 * config" matches `config.x = ` in a builder that owns a fresh object too.
 * The regex is a good CANDIDATE finder and a bad judge.
 *
 * So each rule is a cheap pattern plus a yes/no question. The pattern runs
 * over the ADDED lines of a unified diff; every hit becomes one Noul over its
 * surrounding hunk lines; only hits the judgment calls a violation are
 * reported. Pattern matching, line numbers and thresholds stay in code.
 */

import type { TypeSafeQuestion } from './client.js';
import type { TypeSafeJudge } from './judgments.js';

export interface SemanticLintRule {
  id: string;
  /** Candidate finder, run on each added line. */
  pattern: RegExp;
  /** Only files whose path matches. Default: TypeScript/JavaScript sources. */
  files?: RegExp | undefined;
  /** The violation, as a yes/no question about `snippet`. Yes = violation. */
  question: string;
}

export interface SemanticLintCandidate {
  ruleId: string;
  file: string;
  line: number;
  text: string;
  /** New-side lines around the hit, from the same hunk. */
  snippet: string;
}

export interface SemanticLintFinding extends SemanticLintCandidate {
  /** Probability the candidate violates the rule. */
  probability: number;
}

export interface SemanticLintResult {
  findings: SemanticLintFinding[];
  /** Candidates the judgment cleared or could not decide. */
  cleared: number;
  /** Candidates that never got an answer (host resting, failure). */
  unjudged: number;
}

const DEFAULT_FILES = /\.(?:[cm]?[jt]sx?)$/;

/** Conventions this project enforces (see the project's memory directives). */
export const BUILT_IN_SEMANTIC_LINT_RULES: SemanticLintRule[] = [
  {
    id: 'tool-error-payload',
    pattern: /status\s*:\s*['"]error['"]/,
    question:
      "Does `snippet` return an error result object (such as `{ status: 'error' }`) from a " +
      "tool's execute function instead of throwing an error?",
  },
  {
    id: 'live-config-assignment',
    pattern: /\bconfig(?:\??\.[A-Za-z_$][\w$]*)+\s*=(?!=)/,
    question:
      'Does `snippet` assign a value directly onto a property of the live application config ' +
      'object (mutating it in place) instead of building a new object or calling a patch/set function?',
  },
  {
    id: 'spawn-without-windows-hide',
    pattern: /\b(?:spawn|execFile|fork)\s*\(/,
    question:
      'Does `snippet` start a child process with options that do not include `windowsHide: true`?',
  },
  {
    id: 'abort-listener-leak',
    pattern: /addEventListener\(\s*['"]abort['"]/,
    question:
      "Does `snippet` add an 'abort' listener to an AbortSignal that can outlive the operation, " +
      'without removing the listener when the operation completes?',
  },
];

const CONTEXT_LINES = 6;
const MAX_LINE_CHARS = 2_000;
const MAX_STATEMENT_LINES = 24;
const MAX_SNIPPET_CHARS = 2_400;
const QUESTIONS_PER_REQUEST = 32;

/** Index one past the line where brackets opened on `hunk[idx]` balance. */
function statementEnd(hunk: Array<{ text: string }>, idx: number): number {
  let depth = 0;
  for (let i = idx; i < hunk.length && i <= idx + MAX_STATEMENT_LINES; i++) {
    for (const ch of hunk[i]?.text ?? '') {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    if (depth <= 0) return i + 1;
  }
  return Math.min(hunk.length, idx + MAX_STATEMENT_LINES + 1);
}

/** Pull candidates from a unified diff's added lines. */
export function findSemanticLintCandidates(
  diff: string,
  rules: SemanticLintRule[],
): SemanticLintCandidate[] {
  const out: SemanticLintCandidate[] = [];
  let file = '';
  let hunk: Array<{ line: number; text: string; added: boolean }> = [];

  const flush = (): void => {
    hunk.forEach((entry, idx) => {
      // Minified or generated lines are not reviewable code, and a rule's
      // pattern may come from a repo file: bound the input it runs on.
      if (!entry.added || entry.text.length > MAX_LINE_CHARS) return;
      for (const rule of rules) {
        if (!(rule.files ?? DEFAULT_FILES).test(file) || !rule.pattern.test(entry.text)) continue;
        const from = Math.max(0, idx - CONTEXT_LINES);
        // Extend forward until the hit's brackets close: a multi-line call's
        // options object (where e.g. `windowsHide` lives) is the evidence.
        const to = Math.min(
          hunk.length,
          Math.max(idx + CONTEXT_LINES + 1, statementEnd(hunk, idx)),
        );
        const snippet = hunk
          .slice(from, to)
          .map((l) => l.text)
          .join('\n')
          .slice(0, MAX_SNIPPET_CHARS);
        out.push({ ruleId: rule.id, file, line: entry.line, text: entry.text.trim(), snippet });
      }
    });
    hunk = [];
  };

  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git')) {
      flush();
      file = '';
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const target = raw.slice(4).trim();
      file = target === '/dev/null' ? '' : target.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('--- ')) continue;
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (header) {
      flush();
      newLine = Number(header[1]);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('+')) {
      hunk.push({ line: newLine, text: raw.slice(1), added: true });
      newLine++;
    } else if (raw.startsWith(' ')) {
      hunk.push({ line: newLine, text: raw.slice(1), added: false });
      newLine++;
    }
    // '-' lines are old-side only; '\' is "No newline at end of file".
  }
  flush();
  return out;
}

/** Judge candidates, one request per rule chunk. Never throws. */
export async function judgeSemanticLintCandidates(
  judge: TypeSafeJudge,
  rules: SemanticLintRule[],
  candidates: SemanticLintCandidate[],
  opts: { threshold?: number | undefined; timeoutMs?: number | undefined } = {},
): Promise<SemanticLintResult> {
  const threshold = opts.threshold ?? 0.7;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const byRule = new Map(rules.map((r) => [r.id, r] as const));
  const findings: SemanticLintFinding[] = [];
  let cleared = 0;
  let unjudged = 0;

  const groups = new Map<string, SemanticLintCandidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.ruleId) ?? [];
    list.push(c);
    groups.set(c.ruleId, list);
  }

  for (const [ruleId, list] of groups) {
    const rule = byRule.get(ruleId);
    if (!rule) continue;
    for (let i = 0; i < list.length; i += QUESTIONS_PER_REQUEST) {
      const chunk = list.slice(i, i + QUESTIONS_PER_REQUEST);
      const questions: Record<string, TypeSafeQuestion> = {};
      chunk.forEach((_, j) => {
        questions[`c${j}`] = {
          type: 'noul',
          instructions: rule.question.replaceAll('`snippet`', `\`snippets[${j}]\``),
        };
      });
      try {
        const result = await judge.client.systemOne(
          {
            state: { snippets: chunk.map((c) => `// ${c.file}:${c.line}\n${c.snippet}`) },
            questions,
            model: judge.model,
          },
          AbortSignal.timeout(timeoutMs),
        );
        chunk.forEach((c, j) => {
          const answer = result.answers[`c${j}`];
          if (answer?.type !== 'noul') {
            unjudged++;
          } else if (answer.noul >= threshold) {
            findings.push({ ...c, probability: answer.noul });
          } else {
            cleared++;
          }
        });
      } catch {
        unjudged += chunk.length;
      }
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { findings, cleared, unjudged };
}

/**
 * Parse project rules (`.wrongstack/semantic-lint.json`): an array of
 * `{ id, pattern, files?, question }`. Invalid entries are dropped and named.
 */
export function parseSemanticLintRules(raw: unknown): {
  rules: SemanticLintRule[];
  errors: string[];
} {
  const rules: SemanticLintRule[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { rules, errors: ['expected a JSON array of rules'] };
  raw.forEach((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e?.['id'] !== 'string' || typeof e['pattern'] !== 'string') {
      errors.push(`rule ${i}: needs string "id" and "pattern"`);
      return;
    }
    if (typeof e['question'] !== 'string' || !e['question'].trim()) {
      errors.push(`rule ${e['id']}: needs a "question" (yes = violation)`);
      return;
    }
    try {
      rules.push({
        id: e['id'],
        pattern: new RegExp(e['pattern']),
        files: typeof e['files'] === 'string' ? new RegExp(e['files']) : undefined,
        question: e['question'],
      });
    } catch (err) {
      errors.push(`rule ${e['id']}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  return { rules, errors };
}

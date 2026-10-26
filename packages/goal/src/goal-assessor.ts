/**
 * GoalAssessor — analyzes a goal prompt for duration realism.
 *
 * Takes a goal description, runs it through an LLM with a structured
 * prompt, and returns an assessment: whether any claimed duration is
 * realistic, what concerns exist, and a suggested alternate duration.
 *
 * Uses the same `runOnce(prompt)` pattern as GoalPlanner so it works
 * with any LLM provider (subagent in CLI, deterministic stub in tests).
 */

import { readBundledInstructionText, renderInstructionTemplate } from '@wrongstack/core/utils';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GoalAssessResult {
  /** True when the goal's duration claim is realistic, or when none is claimed. */
  realistic: boolean;
  /** The exact duration text extracted from the goal, or null. */
  durationClaimed: string | null;
  /** Human-readable explanation of the realism assessment. */
  explanation: string;
  /** Suggested more-reasonable duration when the claim is unrealistic, else null. */
  recommendedDuration: string | null;
  /** 1–3 concrete risk/concern items. */
  concerns: string[];
  /** Raw model output for debugging. */
  raw: string;
  /** True when the JSON response could not be parsed. */
  parseFailed: boolean;
  /** Parser warning, if any. */
  parseError?: string | undefined;
}

export interface GoalAssessorOptions {
  /** One-shot LLM call: receives a prompt and returns model text. */
  runOnce: (prompt: string) => Promise<string>;
  /** Goal or project description to assess. */
  goal: string;
}

// ── Assessor ───────────────────────────────────────────────────────────────

export class GoalAssessor {
  constructor(private readonly opts: GoalAssessorOptions) {}

  /** Analyze the goal and return a structured realism assessment. */
  async assess(): Promise<GoalAssessResult> {
    const prompt = this.buildPrompt();
    const raw = await this.opts.runOnce(prompt);
    return this.parse(raw);
  }

  /** Build the instruction prompt for the LLM. */
  buildPrompt(): string {
    return renderInstructionTemplate(readBundledInstructionText('goal/goal-assessor.md'), {
      goal: this.opts.goal,
    });
  }

  /** Extract and validate the JSON object from the raw LLM output. */
  parse(raw: string): GoalAssessResult {
    const json = extractJSONObject(raw);
    if (!json) {
      return {
        realistic: true,
        durationClaimed: null,
        explanation: '',
        recommendedDuration: null,
        concerns: [],
        raw,
        parseFailed: true,
        parseError: 'No JSON object found in model output',
      };
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return {
        realistic: true,
        durationClaimed: null,
        explanation: '',
        recommendedDuration: null,
        concerns: [],
        raw,
        parseFailed: true,
        parseError: 'Failed to parse JSON from model output',
      };
    }

    return {
      realistic: data.realistic === true,
      durationClaimed: typeof data.durationClaimed === 'string' ? data.durationClaimed : null,
      explanation: typeof data.explanation === 'string' ? data.explanation : '',
      recommendedDuration:
        typeof data.recommendedDuration === 'string' ? data.recommendedDuration : null,
      concerns: Array.isArray(data.concerns)
        ? data.concerns.filter((c: unknown): c is string => typeof c === 'string')
        : [],
      raw,
      parseFailed: false,
    };
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────

/**
 * Extract the first JSON object `{ ... }` from text, aware of strings and
 * escape characters. Searches every fenced code block in order, then the whole
 * text, and returns the first balanced block that PARSES as a JSON object —
 * an earlier fence may hold a shell snippet, so the first brace is not
 * necessarily the assessment (same contract as `extractJSONArray` in
 * goal-planner.ts). An empty object `{}` wins only over nothing at all.
 * When nothing parses, the first balanced block is returned so the caller can
 * report a parse failure rather than "no object".
 */
function extractJSONObject(text: string): string | null {
  const candidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((m) => m[1] ?? '')
    .filter(Boolean);
  candidates.push(text);

  // Bound on brace starts tried per candidate, so prose full of braces stays linear-ish.
  const MAX_OBJECT_STARTS = 256;

  let firstBalanced: string | null = null;
  let firstEmpty: string | null = null;
  for (const candidate of candidates) {
    let from = 0;
    for (let tries = 0; tries < MAX_OBJECT_STARTS; tries++) {
      const start = candidate.indexOf('{', from);
      if (start === -1) break;
      const balanced = balancedObjectAt(candidate, start);
      if (balanced) {
        firstBalanced ??= balanced;
        const kind = parsedObjectKind(balanced);
        if (kind === 'object') return balanced;
        if (kind === 'empty') firstEmpty ??= balanced;
      }
      from = start + 1;
    }
  }
  return firstEmpty ?? firstBalanced;
}

/** `'object'` when `json` parses to a non-empty plain object, `'empty'` for `{}`, `'none'` otherwise. */
function parsedObjectKind(json: string): 'object' | 'empty' | 'none' {
  try {
    const data: unknown = JSON.parse(json);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'none';
    return Object.keys(data as Record<string, unknown>).length > 0 ? 'object' : 'empty';
  } catch {
    return 'none';
  }
}

/** Return the balanced `{ ... }` block opening at `start`, aware of strings and escapes. */
function balancedObjectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

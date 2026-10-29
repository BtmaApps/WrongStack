/**
 * Next-step guidance for every `codebase-*` result.
 *
 * Each tool's successful output carries a short `note` derived from WHAT came
 * back: which tool answers the obvious follow-up question, with the concrete
 * argument to pass, or why the result is empty and what to try instead. A
 * model reading a bare `{ results: [] }` or a call list had to rediscover the
 * tool chain on every turn. Failures still THROW — notes ride only on results.
 */

import type { Tool } from '@wrongstack/contracts/types';
import type {
  CodebaseAstReplaceInput,
  CodebaseAstReplaceOutput,
} from './codebase-ast-replace-contracts.js';
import type { CodebaseAtlasOutput } from './codebase-atlas-contracts.js';
import type { CodebaseContextOutput } from './codebase-context-contracts.js';
import type { CodebaseDiffImpactOutput } from './codebase-diff-impact-contracts.js';
import type {
  CodebaseFlowTraceInput,
  CodebaseFlowTraceOutput,
} from './codebase-flow-trace-contracts.js';
import type { ImpactAnalysisOutput } from './codebase-impact-analysis-contracts.js';
import type { IncomingCallsOutput } from './codebase-incoming-calls-contracts.js';
import type { CodebaseIndexOutput } from './codebase-index-contracts.js';
import type { CodebaseInvariantCheckOutput } from './codebase-invariant-check-contracts.js';
import type { CodebaseOnboardOutput } from './codebase-onboard-contracts.js';
import type { OutgoingCallsOutput } from './codebase-outgoing-calls-contracts.js';
import type { CodebaseReadSymbolOutput } from './codebase-read-symbol-contracts.js';
import type { CodebaseRepoMapOutput } from './codebase-repo-map-contracts.js';
import type { CodebaseSearchInput, CodebaseSearchOutput } from './codebase-search-contracts.js';
import type { CodebaseSkeletonOutput } from './codebase-skeleton-contracts.js';
import type { CodebaseStatsOutput } from './codebase-stats-contracts.js';
import type { TargetedTestOutput } from './codebase-targeted-test-contracts.js';
import { displayIndexPath } from './writer-helpers.js';

type AgentContext = Parameters<Tool<unknown, unknown>['execute']>[1];

type NoteFn<I, O> = (out: O, input: I, ctx: AgentContext) => string | undefined;

/**
 * Wrap a tool so its result gains the guidance note. A note the tool already
 * set (caps, ambiguity, stale index) comes first; guidance is appended.
 */
export function withNextStepNote<I, O extends { note?: string | undefined }>(
  tool: Tool<I, O>,
  noteFor: NoteFn<NoInfer<I>, NoInfer<O>>,
): Tool<I, O> {
  const execute = tool.execute;
  return {
    ...tool,
    async execute(input, ctx, opts) {
      const out = await execute.call(tool, input, ctx, opts);
      if (!out || typeof out !== 'object') return out;
      let guidance: string | undefined;
      try {
        guidance = noteFor(out, input, ctx);
      } catch {
        // Guidance is advisory; it must never fail a call that succeeded.
        guidance = undefined;
      }
      if (!guidance) return out;
      return { ...out, note: out.note ? `${out.note} ${guidance}` : guidance };
    },
  };
}

/** Project-relative display path, whatever form the result carried. */
function rel(file: string, ctx: AgentContext): string {
  return displayIndexPath(ctx?.projectRoot ?? ctx?.cwd, file);
}

const q = (value: string) => JSON.stringify(value);

/** Languages whose symbols are headings or keys, not callable code. */
const DOC_LANGS = new Set<string>(['md', 'json', 'yaml', 'toml', 'css', 'html', 'data']);

export const searchNote: NoteFn<CodebaseSearchInput, CodebaseSearchOutput> = (out, input, ctx) => {
  const top = out.results[0];
  if (!top) {
    const filters = (['kind', 'lang', 'file', 'lspKind'] as const).filter(
      (k) => input[k] !== undefined,
    );
    return (
      `No indexed symbol matched ${q(input.query)}. ` +
      (filters.length > 0 ? `Drop the ${filters.join('/')} filter(s), or try` : 'Try') +
      ' fewer or different words (symbol names, not sentences), codebase-context for a concept-level query, or grep for exact text, string literals and comments.'
    );
  }
  const file = rel(top.file, ctx);
  const capped =
    out.total > out.results.length
      ? `${out.total} candidates, ${out.results.length} shown — raise \`limit\` or add kind/file filters to narrow. `
      : '';
  // A doc heading or config key has no body to read and no callers.
  if (DOC_LANGS.has(top.lang)) {
    return (
      `${capped}The top hit is a ${top.lang} ${top.kind} (documentation/config, not code): read ${q(file)} around line ${top.line}, ` +
      'or add `kind: "function"` (or another code kind) to search code only.'
    );
  }
  return (
    `${capped}Next: codebase-read-symbol({ file: ${q(file)}, symbol: ${q(top.name)} }) reads its code; ` +
    `codebase-incoming-calls({ symbol: ${q(top.name)} }) lists callers; codebase-skeleton({ path: ${q(file)} }) outlines the file.`
  );
};

export const skeletonNote: NoteFn<unknown, CodebaseSkeletonOutput> = (out) => {
  const parts: string[] = [];
  if (out.moreFiles || (out.omittedFiles?.length ?? 0) > 0) {
    parts.push('Output was truncated — pass a narrower `path`, or raise `maxFiles`/`maxChars`.');
  }
  if (out.stats.symbolCount === 0) {
    parts.push(
      'No declarations found here (config/data file or unsupported syntax) — read the file directly.',
    );
  } else {
    const first = out.files?.find((f) => f.stats.symbolCount > 0)?.file;
    const target = out.isDir && first ? `${out.path.replace(/\/$/, '')}/${first}` : out.path;
    parts.push(
      `Bodies are elided as /* Lstart-Lend */. Next: codebase-read-symbol({ file: ${q(target)}, symbol: "<name>" }) reads one body (use "Class.method" for members).`,
    );
  }
  return parts.join(' ');
};

export const readSymbolNote: NoteFn<unknown, CodebaseReadSymbolOutput> = (out) =>
  `Before changing ${q(out.symbol)}: codebase-impact-analysis({ symbol: ${q(out.symbol)} }) shows its blast radius. ` +
  `To edit: codebase-ast-replace({ file: ${q(out.file)}, symbol: ${q(out.symbol)}, newBody }) — newBody is only the statements inside the braces unless target: "full".`;

function callsNote(direction: 'incoming' | 'outgoing') {
  return (out: IncomingCallsOutput | OutgoingCallsOutput, _input: unknown, ctx: AgentContext) => {
    // The tool already explained a not-found symbol in its own note.
    if (out.note?.includes('not found in the index')) return undefined;
    if (out.calls.length === 0) {
      return direction === 'incoming'
        ? `No indexed callers of ${q(out.symbol)}: it may be unused, an entry point, or reached dynamically (callbacks, string dispatch, reflection). Confirm with grep before deleting it.`
        : `No indexed outgoing calls from ${q(out.symbol)}: it may be a leaf, or only call through dynamic/unresolved references.`;
    }
    const first = out.calls[0]?.symbol;
    const hop = first
      ? ` Follow one hop with codebase-read-symbol({ file: ${q(rel(first.file, ctx))}, symbol: ${q(first.name)} }).`
      : '';
    return direction === 'incoming'
      ? `callType "import" entries are import bindings, "call" entries are real call sites.${hop} For the full blast radius and affected tests: codebase-impact-analysis({ symbol: ${q(out.symbol)} }).`
      : `callType "import" entries are imported bindings, "call" entries are real calls.${hop} For an end-to-end path from an entry point: codebase-flow-trace({ symbol: ${q(out.symbol)} }).`;
  };
}
export const incomingCallsNote = callsNote('incoming');
export const outgoingCallsNote = callsNote('outgoing');

export const impactNote: NoteFn<unknown, ImpactAnalysisOutput> = (out) => {
  if (out.symbolFound === false) return undefined; // summary already says so
  if (out.totalCallSites === 0 && out.affectedProductionFiles.length === 0) {
    return `No indexed dependents — safe to change in isolation, but grep for ${q(out.symbol)} first if it is exported or called dynamically.`;
  }
  return out.affectedTestFiles.length > 0
    ? `After editing, run codebase-targeted-test({ symbol: ${q(out.symbol)} }) — it executes the ${out.affectedTestFiles.length} affected test suite(s) only.`
    : 'No test suite covers these call sites — verify the change manually or add a test.';
};

export const contextNote: NoteFn<unknown, CodebaseContextOutput> = (out) => {
  if (out.entries.length === 0 || out.indexStatus === 'no-matches') {
    return `Nothing in the index matched ${q(out.query)}. Use identifier-like words (e.g. "session store" rather than a sentence), codebase-search for a specific name, or grep for literal text.`;
  }
  const parts: string[] = [];
  if (out.indexStatus === 'unranked') {
    parts.push(
      'Results are lexical only (no reference graph yet) — run codebase-index to rank them.',
    );
  }
  const next: string[] = [];
  const top = out.entries[0];
  if (top) next.push(`codebase-skeleton({ path: ${q(top.file)} }) outlines the top file`);
  for (const entry of out.entries) {
    const seed = entry.symbols.find((s) => s.seed);
    if (!seed) continue;
    next.push(
      `codebase-read-symbol({ file: ${q(entry.file)}, symbol: ${q(seed.name)} }) reads a matched symbol`,
    );
    break;
  }
  if (next.length > 0) parts.push(`Next: ${next.join('; ')}.`);
  return parts.join(' ') || undefined;
};

export const repoMapNote: NoteFn<unknown, CodebaseRepoMapOutput> = (out) => {
  const hub = out.rankedFiles[0];
  if (!hub) return 'The map is empty — run codebase-index first, then retry.';
  return (
    `Files are ordered by graph centrality. Next: codebase-skeleton({ path: ${q(hub)} }) for the hub, ` +
    'codebase-context({ query }) for a task-focused slice, or focusFiles: [...] to re-center the map on files you are editing.'
  );
};

export const atlasNote: NoteFn<unknown, CodebaseAtlasOutput> = (out) => {
  if (!out.indexed) return 'No index yet — run codebase-index, then retry codebase-atlas.';
  const parts: string[] = [];
  // `missing` is the normal state: the persisted atlas only feeds the CodeMap.
  if (out.freshness && !out.freshness.fresh && out.freshness.reason !== 'missing') {
    parts.push(`The persisted atlas is ${out.freshness.reason}; mode: "write" regenerates it.`);
  }
  const hub = out.brief?.hubs[0]?.path ?? out.communities?.[0]?.hub;
  if (hub) {
    parts.push(
      `Next: codebase-skeleton({ path: ${q(hub)} }) for the top hub, or codebase-onboard() for a guided reading order.`,
    );
  }
  return parts.join(' ') || undefined;
};

export const flowTraceNote: NoteFn<CodebaseFlowTraceInput, CodebaseFlowTraceOutput> = (
  out,
  input,
) => {
  if (out.flows.length === 0) {
    return input.symbol
      ? `${q(input.symbol)} is not an indexed entry point or symbol. Verify the name with codebase-search, or omit \`symbol\` to auto-detect entry points.`
      : 'No entry points detected (no main/handler/CLI/route symbols in the index). Pass `symbol` to trace from a specific function.';
  }
  const longest = out.flows.reduce((a, b) => (b.steps.length > a.steps.length ? b : a));
  const step = longest.steps.at(-1);
  return step
    ? `Steps are call-graph hops, not runtime traces. Read a hop with codebase-read-symbol({ file: ${q(step.file)}, symbol: ${q(step.symbol)} }).`
    : undefined;
};

export const onboardNote: NoteFn<unknown, CodebaseOnboardOutput> = (out) => {
  const first = out.steps[0];
  return first
    ? `Read the tour in order. Start with codebase-skeleton({ path: ${q(first.file)} }); use \`focus\` to tour one subsystem in depth.`
    : 'The index has no ranked files to tour — run codebase-index first.';
};

export const diffImpactNote: NoteFn<unknown, CodebaseDiffImpactOutput> = (out) => {
  if (out.changedFiles.length === 0) {
    return 'Nothing to analyze. Pass `baseRef` (e.g. "main..HEAD") for committed branch changes, or `staged: true` for the index only.';
  }
  const parts: string[] = [];
  if (out.invariantViolations.length > 0) {
    parts.push(
      `${out.invariantViolations.length} contract break(s) above will fail dependents — fix them or update every listed caller.`,
    );
  }
  if (out.affectedTestFiles.length > 0) {
    parts.push(
      `Run codebase-targeted-test({ testFiles: ${JSON.stringify(out.affectedTestFiles.slice(0, 10))} }) to verify.`,
    );
  } else if (out.affectedSymbols.length > 0) {
    parts.push('No test suite covers the changed symbols — add a test or verify manually.');
  }
  return parts.join(' ') || undefined;
};

export const invariantNote: NoteFn<unknown, CodebaseInvariantCheckOutput> = (out) => {
  if (!out.verified) {
    return 'This language has no invariant rules — `valid` proves nothing; review the change manually.';
  }
  return out.valid
    ? undefined
    : 'Each violation breaks existing callers. Keep the old signature/export (add an overload or optional parameter), or run codebase-impact-analysis on the symbol and update every caller.';
};

export const astReplaceNote: NoteFn<CodebaseAstReplaceInput, CodebaseAstReplaceOutput> = (
  out,
  input,
) => {
  const promoted =
    out.appliedTarget === 'full' && (input.target ?? 'body') === 'body'
      ? 'newBody was a complete declaration, so it replaced the whole declaration (target "full"). '
      : '';
  return `${promoted}Next: codebase-targeted-test({ file: ${q(out.file)} }) runs the tests that cover this file.`;
};

export const targetedTestNote: NoteFn<unknown, TargetedTestOutput> = (out) => {
  if (out.status === 'no_tests_found') {
    return 'No covering test was found via the call graph or naming conventions. Pass `testFiles` explicitly, or add a test next to the source.';
  }
  if (out.status === 'failed') {
    return out.testsRun === 0 || out.passed + out.failed === 0
      ? 'The suite failed before any test ran (import/syntax/config error) — read `output` for the first error; it is usually in the source under test, not the test.'
      : 'Read `output` for the first failing assertion, fix it, and rerun this same call.';
  }
  return undefined;
};

export const indexNote: NoteFn<unknown, CodebaseIndexOutput> = (out) => {
  if (out.errors.length > 0) {
    return `${out.errors.length} file(s) failed to index and are invisible to codebase-* queries; search them with grep.`;
  }
  return 'Index is current. Start with codebase-search({ query }) for names or codebase-context({ query }) for a concept.';
};

export const statsNote: NoteFn<unknown, CodebaseStatsOutput> = (out) => {
  if (out.indexing) return undefined; // indexStatus already explains the build
  if (out.statsAvailable && out.totalFiles === 0) {
    return 'The index is empty — run codebase-index to build it.';
  }
  return undefined;
};

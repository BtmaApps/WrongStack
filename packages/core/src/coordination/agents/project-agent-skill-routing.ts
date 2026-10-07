/**
 * Route a free-text directive to the best-matching project skill by name
 * and vocabulary tokens. Split out of project-agent-skill-layer.ts.
 */

/**
 * Vocabulary that maps a directive's wording onto a bundled skill. Only used
 * to route a captured directive when the agent did not tag it explicitly;
 * an unroutable directive simply stays role-level, which is always safe.
 */
const SKILL_VOCABULARY: Record<string, readonly string[]> = {
  'api-design': ['api', 'endpoint', 'rest', 'openapi', 'schema', 'contract', 'versioning'],
  'audit-log': ['audit', 'log', 'logging', 'trace', 'provenance', 'ledger'],
  'bug-hunter': ['bug', 'defect', 'repro', 'root cause', 'regression', 'crash'],
  chimera: ['review', 'reviewer', 'critique', 'adversarial', 'second opinion'],
  'code-review': ['code review', 'pull request', 'diff', 'merge request', 'blast radius'],
  'codebase-navigation': [
    'navigate',
    'entry point',
    'call graph',
    'repo map',
    'architecture',
    'where is',
    'consumer',
    'importer',
    'call site',
    'caller',
    'barrel',
    're-export',
    'import graph',
    'locate',
  ],
  'data-governance': ['pii', 'retention', 'governance', 'gdpr', 'data policy'],
  debugging: ['debug', 'stack trace', 'reproduce', 'bisect', 'hang', 'root cause', 'flaky'],
  'docker-deploy': ['docker', 'container', 'image', 'compose', 'deploy', 'k8s'],
  'git-flow': ['git', 'branch', 'commit', 'rebase', 'merge', 'worktree', 'pr'],
  mnemosyne: ['memory', 'recall', 'knowledge base'],
  'multi-agent': ['subagent', 'fleet', 'director', 'delegate', 'coordination', 'roster'],
  'node-modern': ['node', 'esm', 'package.json', 'pnpm', 'npm', 'runtime'],
  observability: ['metric', 'telemetry', 'tracing', 'dashboard', 'alert', 'profil'],
  'output-standards': ['format', 'report', 'output', 'markdown', 'summary'],
  'plugin-author': ['plugin', 'hook', 'manifest', 'extension'],
  'prompt-engineering': ['prompt', 'system message', 'instruction', 'few-shot'],
  'react-modern': ['react', 'component', 'hook', 'jsx', 'tsx', 'render', 'ui'],
  'refactor-planner': ['refactor', 'extract', 'rename', 'restructure', 'decompose'],
  'research-web': ['research', 'documentation', 'upstream', 'changelog', 'registry'],
  sdd: ['spec', 'requirement', 'acceptance', 'plan', 'task breakdown'],
  'security-scanner': ['security', 'vulnerab', 'injection', 'secret', 'auth', 'sanitiz'],
  'skill-creator': ['skill', 'skill.md', 'authoring'],
  'tech-stack': ['dependency', 'version', 'upgrade', 'toolchain', 'stack'],
  testing: ['test', 'vitest', 'jest', 'coverage', 'assert', 'fixture', 'mock', 'spec file'],
  'typescript-strict': ['typescript', 'tsc', 'type', 'generic', 'strict', 'noemit', '.d.ts'],
  // Not `verify` / `done`: "Always verify…" is the opener the capture prompt
  // itself recommends, so those two words claimed directives about anything.
  'verify-before-done': ['verification', 'evidence', 'definition of done', 'mark as done'],
  'wrongstack-mailbox': ['mailbox', 'message', 'inbox', 'broadcast'],
};

/**
 * Words that appear in skill *names* but say nothing about the skill on their
 * own. `wrongstack-mailbox` split into `wrongstack` routed every directive that
 * mentioned `@wrongstack/core` to the mailbox skill; `verify-before-done` split
 * into `verify` and `before` claimed every "Always verify … before …" rule,
 * which is the exact phrasing the capture prompt asks agents to use.
 */
const GENERIC_NAME_TOKENS = new Set([
  'agent',
  'author',
  'before',
  'code',
  'creator',
  'data',
  'design',
  'done',
  'engineering',
  'flow',
  'hunter',
  'modern',
  'multi',
  'output',
  'planner',
  'stack',
  'standards',
  'tech',
  'verify',
  'web',
  'wrongstack',
]);

function skillTokens(skill: string): string[] {
  return [
    ...skill.split('-').filter((token) => !GENERIC_NAME_TOKENS.has(token)),
    ...(SKILL_VOCABULARY[skill] ?? []),
  ].filter((token) => token.length >= 3);
}

const tokenMatchers = new Map<string, RegExp>();

/**
 * Match a routing token as a word, not as a substring.
 *
 * Substring matching let `hang` (debugging) claim every "change", `log`
 * (audit-log) claim "dialog" and "catalog", `spec` (sdd) claim "inspect", and
 * `npm` claim "pnpm". Replayed over this repository's own ~400 captured
 * directives, word matching changes the route of about one in six;
 * `explore-companion` alone moved from 57 to 98 directives on
 * `codebase-navigation`, the only one of its skills it can actually load.
 * Short tokens must now stand as a word (with a plural/verb
 * suffix); tokens of five characters or more stay prefix stems on purpose
 * (`vulnerab`, `sanitiz`, `profil`). A token that itself starts with
 * punctuation (`.d.ts`) needs no leading boundary.
 */
function tokenMatcher(token: string): RegExp {
  let matcher = tokenMatchers.get(token);
  if (!matcher) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lead = /^[a-z0-9]/.test(token) ? '(?<![a-z0-9])' : '';
    const tail =
      token.length >= 5 || !/[a-z0-9]$/.test(token)
        ? ''
        : '(?:s|es|ed|d|ing|er|ers|ged|ging|ger|gers)?(?![a-z0-9])';
    matcher = new RegExp(`${lead}${escaped}${tail}`);
    tokenMatchers.set(token, matcher);
  }
  return matcher;
}

/** Explicit tag form the agent can use: `## LEARNED [skill: testing]`. */
export const LEARNED_SKILL_TAG = /\[\s*skill\s*[:=]\s*([a-z0-9][a-z0-9-]{0,63})\s*\]/i;

/**
 * Route a captured directive to one of the role's candidate skills.
 * Returns `undefined` when nothing matches well enough — an unrouted directive
 * stays role-level rather than being forced into the wrong skill.
 */
export function routeDirectiveToSkill(
  text: string,
  candidates: readonly string[],
): string | undefined {
  const tagged = LEARNED_SKILL_TAG.exec(text)?.[1]?.toLowerCase();
  if (tagged && candidates.includes(tagged)) return tagged;
  const haystack = text.toLowerCase();
  let best: { skill: string; score: number } | undefined;
  for (const skill of candidates) {
    let score = 0;
    for (const token of skillTokens(skill)) {
      if (tokenMatcher(token).test(haystack)) score += token.length >= 6 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { skill, score };
  }
  // Require more than one weak hit so a stray "test" in prose does not
  // permanently bind an unrelated directive to the testing skill.
  return best && best.score >= 2 ? best.skill : undefined;
}

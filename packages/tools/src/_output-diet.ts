/**
 * Command-aware output diet for the shell tools (`bash`, `exec`).
 *
 * `normalizeCommandOutput` already strips what no reader needs from ANY
 * command (ANSI, progress redraws, repeated lines). This layer knows what a
 * reader runs a few specific commands FOR, and drops only the lines that
 * never answer that question:
 *
 *  - a test run: the passing-test lines and the stack frames inside
 *    `node_modules` / `node:internal` — failures, their messages, the frames
 *    of the project's own code and the summary all stay;
 *  - a package install: the resolver progress lines and the per-package
 *    download / "already satisfied" chatter — errors, warnings about the
 *    project and the final "added N packages" line stay.
 *
 * It never rewrites a kept line and never reorders, so what the model reads is
 * a subsequence of what the command printed. A diet that saves less than
 * {@link MIN_SAVED_RATIO} of the text or {@link MIN_SAVED_CHARS} characters is
 * not applied: the model reads the output as it was. When lines are omitted
 * the caller persists the full output to the spool and says where it is, so
 * nothing is lost — only moved out of the context.
 */

/** A diet that saves less than this share of the text is not worth the note. */
const MIN_SAVED_RATIO = 0.05;
/** ...nor one that saves fewer characters than this. */
const MIN_SAVED_CHARS = 40;

type DietKind = 'js-test' | 'pytest' | 'go-test' | 'cargo-test' | 'install';

interface DietRule {
  kind: DietKind;
  /** What the omitted lines were, for the note the model reads. */
  label: string;
  drop(line: string): boolean;
}

/** Stack frames of dependencies and the runtime: never the project's own code. */
const DEPENDENCY_FRAME =
  /^\s*(?:at\s.*(?:[\\/]node_modules[\\/]|\(node:|\bnode:internal)|❯\s.*[\\/]node_modules[\\/])/;

const RULES: Readonly<Record<DietKind, DietRule>> = {
  'js-test': {
    kind: 'js-test',
    label: 'passing tests and dependency stack frames',
    // vitest / jest / bun: `✓ file (12 tests) 34ms`, `√ name`, jest's `PASS path`.
    drop: (line) =>
      /^\s*[✓√✔]\s/.test(line) || /^\s*PASS\s+\S/.test(line) || DEPENDENCY_FRAME.test(line),
  },
  pytest: {
    kind: 'pytest',
    label: 'passing tests',
    drop: (line) => /^\S+::\S+.*\sPASSED(?:\s|$)/.test(line) || /^PASSED\s+\S+::/.test(line),
  },
  'go-test': {
    kind: 'go-test',
    label: 'passing tests and test-run chatter',
    drop: (line) => /^=== (?:RUN|PAUSE|CONT|NAME)\s/.test(line) || /^\s*--- PASS:/.test(line),
  },
  'cargo-test': {
    kind: 'cargo-test',
    label: 'passing tests',
    drop: (line) => /^test \S.* \.\.\. ok$/.test(line),
  },
  install: {
    kind: 'install',
    label: 'install progress and per-package download lines',
    drop: (line) =>
      /^Progress: resolved \d/.test(line) ||
      /^\s*[+-]{8,}\s*$/.test(line) ||
      /^\s*(?:Collecting|Downloading|Using cached|Requirement already satisfied:)\s/.test(line) ||
      /^\s*━+/.test(line),
  },
};

// A runner INVOKED as a command word — not `vitest.config.ts` or `src/jest/x`.
// `pnpm --filter @x/core test` puts flags between the manager and the script.
const JS_TEST =
  /(?:^|[\s;&|(])(?:vitest|jest)(?=\s|$)|\bbun\s+test\b|\b(?:pnpm|npm|yarn|bun)\b[^;&|\n]*?\s(?:run\s+)?test(?::\S+)?(?=\s|$)/;
const PYTEST = /(?:^|[\s;&|(])pytest(?=\s|$)|\bpython3?\s+-m\s+pytest\b/;
const GO_TEST = /\bgo\s+test\b/;
const CARGO_TEST = /\bcargo\s+(?:test|nextest)\b/;
const INSTALL =
  /\b(?:pnpm|npm|yarn|bun)\s+(?:install|i|add|ci)\b|\bpip3?\s+install\b|\buv\s+(?:pip\s+install|add|sync)\b/;

/** The diet a command gets, or null for a command this layer does not know. */
export function classifyCommandForDiet(command: string): DietKind | null {
  const cmd = command.trim();
  if (!cmd) return null;
  if (JS_TEST.test(cmd)) return 'js-test';
  if (PYTEST.test(cmd)) return 'pytest';
  if (GO_TEST.test(cmd)) return 'go-test';
  if (CARGO_TEST.test(cmd)) return 'cargo-test';
  if (INSTALL.test(cmd)) return 'install';
  return null;
}

export interface DietResult {
  text: string;
  /** Lines left out. Always > 0 — a diet that omits nothing returns null. */
  omittedLines: number;
  /** What the omitted lines were ("passing tests", ...). */
  label: string;
}

/**
 * Apply the command's diet to already-normalized output. Returns null when the
 * command has no diet, or the diet would not save enough to be worth a note.
 */
export function dietCommandOutput(command: string, text: string): DietResult | null {
  if (!text) return null;
  const kind = classifyCommandForDiet(command);
  if (!kind) return null;
  const rule = RULES[kind];
  const kept: string[] = [];
  let omittedLines = 0;
  for (const line of text.split('\n')) {
    if (rule.drop(line)) omittedLines++;
    else kept.push(line);
  }
  if (omittedLines === 0) return null;
  const dieted = kept.join('\n').replace(/\n{3,}/g, '\n\n');
  const saved = text.length - dieted.length;
  if (saved < MIN_SAVED_CHARS || saved < text.length * MIN_SAVED_RATIO) return null;
  return { text: dieted, omittedLines, label: rule.label };
}

/** The one line the model reads under a dieted result. */
export function dietNote(result: DietResult, fullOutputPath: string | null): string {
  const where = fullOutputPath
    ? ` — full output at ${fullOutputPath}; read/grep it if you need an omitted line`
    : '';
  return `\n[output-diet: omitted ${result.omittedLines} line(s) of ${result.label}${where}]`;
}

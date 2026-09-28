import { execCommand } from '../exec-command.js';
import type { PolyglotMeta } from '../suites/polyglot.js';
import type { BenchTask, GradeResult } from '../types.js';
import { restoredNote, restoreFromTemplate } from './restore-files.js';

/**
 * Deterministic polyglot grader: run the exercise's own test command in the
 * finished workdir. Exit code 0 → passed. No LLM, no judgement — this is the
 * invariant that keeps the report model-independent.
 *
 * For languages with a dependency-install step (JS `npm install`, etc.) the
 * setup command runs first; if setup fails the task is graded as not-passed
 * with the setup error as detail (it cannot be the model's fault, but the run
 * is genuinely ungradeable, so it counts as a fail rather than crashing).
 */
export async function gradePolyglot(opts: {
  workdir: string;
  task: BenchTask;
  /** Per-step timeout for setup/test commands. */
  timeoutMs: number;
}): Promise<GradeResult> {
  const meta = opts.task.meta as never as PolyglotMeta;

  // The agent works in this same directory, so its test files are whatever the
  // agent left there: rewriting a test to `assert True` scored as a pass.
  // Grade against the exercise's OWN tests, as Aider's harness does.
  const restored = await restoreFromTemplate(opts.task.templateDir, opts.workdir, meta.testFiles);
  const note = restoredNote(restored, 'test file(s)');

  if (meta.setupCommand) {
    const setup = await execCommand({
      command: meta.setupCommand.command,
      args: meta.setupCommand.args,
      cwd: opts.workdir,
      timeoutMs: opts.timeoutMs,
    });
    if (setup.exitCode !== 0) {
      return {
        passed: false,
        detail: withNote(
          `setup failed (${meta.setupCommand.command}): ${tail(setup.stderr || setup.stdout)}`,
          note,
        ),
      };
    }
  }

  const test = await execCommand({
    command: meta.testCommand.command,
    args: meta.testCommand.args,
    cwd: opts.workdir,
    timeoutMs: opts.timeoutMs,
  });

  if (test.timedOut) {
    return { passed: false, detail: withNote('test command timed out', note) };
  }
  if (test.exitCode === 0) {
    return note ? { passed: true, detail: note } : { passed: true };
  }
  return { passed: false, detail: withNote(tail(test.stdout + '\n' + test.stderr), note) };
}

function withNote(detail: string, note: string): string {
  return note ? `${note}\n${detail}` : detail;
}

/** Last ~500 chars of output — enough to see the failing assertion. */
function tail(s: string): string {
  const clean = s.trim();
  return clean.length > 500 ? `…${clean.slice(-500)}` : clean;
}

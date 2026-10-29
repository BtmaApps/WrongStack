/**
 * Exercism ships all but the first test disabled (JS `xtest(`, Java
 * `@Disabled`), so the polyglot grader used to run one test and score a stub
 * as a solve. cpp builds also broke outright: the CMakeLists names its target
 * after the directory, which in a bench workdir is a hashed label.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.hoisted(() => ({ execCommand: vi.fn() }));
vi.mock('../src/exec-command.js', () => ({ execCommand: exec.execCommand }));

import { gradePolyglot } from '../src/graders/polyglot-grader.js';
import {
  installDependencies,
  type PolyglotMeta,
  preparedText,
  prepareExercise,
} from '../src/suites/polyglot.js';
import type { BenchTask } from '../src/types.js';

const meta = (over: Partial<PolyglotMeta>): PolyglotMeta => ({
  language: 'javascript',
  solutionFiles: ['bowling.js'],
  testFiles: ['bowling.spec.js'],
  testCommand: { command: 'npm', args: ['test'] },
  ...over,
});

describe('preparedText', () => {
  it('un-skips JavaScript xtest without touching lookalike names', () => {
    const text = "test('a', f);\nxtest('b', f);\n  xtest('c', f);\nmyxtest('d');\n";
    expect(preparedText(meta({}), 'bowling.spec.js', text)).toBe(
      "test('a', f);\ntest('b', f);\n  test('c', f);\nmyxtest('d');\n",
    );
  });

  it('strips Java @Disabled annotations the way Aider does', () => {
    const m = meta({ language: 'java', testFiles: ['src/test/java/BowlingTest.java'] });
    const text = '  @Disabled("Remove to run test")\n  @Test\n  public void b() {}\n';
    expect(preparedText(m, 'src/test/java/BowlingTest.java', text)).toBe(
      // Aider's regex keeps the annotation's own indent; harmless in Java.
      '    @Test\n  public void b() {}\n',
    );
  });

  it('pins the cpp target name to the slug and silences clang-only Catch noise', () => {
    const m = meta({
      language: 'cpp',
      slug: 'all-your-base',
      testFiles: ['all_your_base_test.cpp'],
    });
    const cmake =
      'get_filename_component(exercise ${CMAKE_CURRENT_SOURCE_DIR} NAME)\n' +
      'COMPILE_FLAGS "-Wall -Wextra -Wpedantic -Werror"\n';
    expect(preparedText(m, 'CMakeLists.txt', cmake)).toBe(
      'set(exercise all-your-base)\nCOMPILE_FLAGS "-Wall -Wextra -Wpedantic -Werror -Wno-c2y-extensions"\n',
    );
  });

  it('leaves solution files and other languages alone', () => {
    expect(preparedText(meta({}), 'bowling.js', "xtest('x')")).toBe("xtest('x')");
    const py = meta({ language: 'python', testFiles: ['t.py'] });
    expect(preparedText(py, 't.py', "xtest('x')")).toBe("xtest('x')");
  });
});

describe('polyglot workdir preparation and grading', () => {
  let root: string;
  let template: string;
  let workdir: string;
  const shipped = "test('first', f);\nxtest('second', f);\n";
  const runnable = "test('first', f);\ntest('second', f);\n";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'polyglot-prepare-'));
    template = path.join(root, 'template');
    workdir = path.join(root, 'work');
    await fs.mkdir(template, { recursive: true });
    await fs.writeFile(path.join(template, 'bowling.spec.js'), shipped);
    await fs.cp(template, workdir, { recursive: true });
    exec.execCommand.mockReset();
    exec.execCommand.mockImplementation(async (o: { cwd: string }) => {
      const seen = await fs.readFile(path.join(o.cwd, 'bowling.spec.js'), 'utf8');
      // The "suite" passes only when every test is enabled.
      return { exitCode: seen === runnable ? 0 : 1, stdout: '', stderr: '', timedOut: false };
    });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const task = (): BenchTask => ({
    id: 'polyglot/javascript/bowling',
    suite: 'polyglot',
    prompt: '',
    templateDir: template,
    meta: meta({}) as never as Record<string, unknown>,
  });

  it('gives the agent the full suite and grades it without blaming the agent', async () => {
    await prepareExercise(workdir, meta({}));
    expect(await fs.readFile(path.join(workdir, 'bowling.spec.js'), 'utf8')).toBe(runnable);
    const grade = await gradePolyglot({ workdir, task: task(), timeoutMs: 1000 });
    expect(grade).toEqual({ passed: true });
  });

  it('re-enables tests an agent switched back off, and says it restored them', async () => {
    await fs.writeFile(path.join(workdir, 'bowling.spec.js'), shipped);
    const grade = await gradePolyglot({ workdir, task: task(), timeoutMs: 1000 });
    expect(grade.passed).toBe(true);
    expect(grade.detail).toMatch(/restored modified test file\(s\): bowling\.spec\.js/);
  });
});

describe('installDependencies', () => {
  beforeEach(() => {
    exec.execCommand.mockReset();
    exec.execCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
  });

  it('installs a JavaScript exercise before the agent so it can run jest itself', async () => {
    const setup = { command: 'npm', args: ['install', '--prefer-offline'] };
    await installDependencies('/w', meta({ setupCommand: setup }));
    expect(exec.execCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'npm', args: setup.args, cwd: '/w' }),
    );
  });

  it('leaves other languages and setup-less exercises to the grader', async () => {
    await installDependencies(
      '/w',
      meta({ language: 'cpp', setupCommand: { command: 'cmake', args: [] } }),
    );
    await installDependencies('/w', meta({}));
    expect(exec.execCommand).not.toHaveBeenCalled();
  });
});

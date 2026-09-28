/**
 * The polyglot grader runs the exercise's tests in the agent's own workdir.
 * Nothing restored the test files first, so a model that rewrote a test to
 * `assert True` (instead of implementing the solution) was scored as a pass.
 * The grader now copies the exercise's test files back from the template.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.hoisted(() => ({ execCommand: vi.fn() }));
vi.mock('../src/exec-command.js', () => ({ execCommand: exec.execCommand }));

import { gradePolyglot } from '../src/graders/polyglot-grader.js';
import type { BenchTask } from '../src/types.js';

const ORIGINAL_TEST = 'def test_add():\n    assert add(2, 3) == 5\n';
let root: string;
let template: string;
let workdir: string;

const task = (testFiles: string[]): BenchTask => ({
  id: 'polyglot/python/adder',
  suite: 'polyglot',
  prompt: '',
  templateDir: template,
  meta: {
    language: 'python',
    solutionFiles: ['adder.py'],
    testFiles,
    testCommand: { command: 'python', args: ['-m', 'pytest'] },
  } as never as Record<string, unknown>,
});

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'polyglot-restore-'));
  template = path.join(root, 'template');
  workdir = path.join(root, 'work');
  await fs.mkdir(path.join(template, 'tests'), { recursive: true });
  await fs.writeFile(path.join(template, 'tests', 'adder_test.py'), ORIGINAL_TEST);
  await fs.cp(template, workdir, { recursive: true });
  // The "test run" passes only when it sees the exercise's original test.
  exec.execCommand.mockReset();
  exec.execCommand.mockImplementation(async (o: { cwd: string }) => {
    const seen = await fs
      .readFile(path.join(o.cwd, 'tests', 'adder_test.py'), 'utf8')
      .catch(() => '');
    return { exitCode: seen === ORIGINAL_TEST ? 1 : 0, stdout: '', stderr: '', timedOut: false };
  });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('gradePolyglot test-file restoration', () => {
  it('grades a rewritten test against the original and says so', async () => {
    await fs.writeFile(
      path.join(workdir, 'tests', 'adder_test.py'),
      'def test_add():\n    assert True\n',
    );
    const result = await gradePolyglot({
      workdir,
      task: task(['tests/adder_test.py']),
      timeoutMs: 1000,
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/^restored modified test file\(s\): tests\/adder_test\.py/);
    expect(await fs.readFile(path.join(workdir, 'tests', 'adder_test.py'), 'utf8')).toBe(
      ORIGINAL_TEST,
    );
  });

  it('restores a deleted test file', async () => {
    await fs.rm(path.join(workdir, 'tests', 'adder_test.py'));
    const result = await gradePolyglot({
      workdir,
      task: task(['tests/adder_test.py']),
      timeoutMs: 1000,
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/restored modified test file/);
  });

  it('passes a real solution graded against the restored test, noting the restore', async () => {
    exec.execCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false });
    await fs.writeFile(path.join(workdir, 'tests', 'adder_test.py'), 'tampered\n');
    const result = await gradePolyglot({
      workdir,
      task: task(['tests/adder_test.py']),
      timeoutMs: 1000,
    });
    expect(result).toEqual({
      passed: true,
      detail: 'restored modified test file(s): tests/adder_test.py',
    });
  });

  it('leaves untouched tests alone and ignores paths outside the roots', async () => {
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'keep');
    const result = await gradePolyglot({
      workdir,
      task: task(['tests/adder_test.py', '../outside.txt', outside]),
      timeoutMs: 1000,
    });
    expect(result.detail ?? '').not.toMatch(/restored/);
    expect(await fs.readFile(outside, 'utf8')).toBe('keep');
  });
});

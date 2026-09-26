import { describe, expect, it } from 'vitest';
import { classifyCommandForDiet, dietCommandOutput, dietNote } from '../src/_output-diet.js';
import { createCommandOutputCapture, shapeCommandOutput } from '../src/_util.js';

const passingVitest = [
  ' RUN  v5.0.0 D:/repo',
  '',
  ...Array.from(
    { length: 40 },
    (_, i) => ` ✓ packages/core/tests/unit-${i}.test.ts (12 tests) ${i}ms`,
  ),
  '',
  ' Test Files  40 passed (40)',
  '      Tests  480 passed (480)',
  '   Duration  4.21s',
].join('\n');

describe('classifyCommandForDiet', () => {
  it('recognizes runners invoked as commands, not files named after them', () => {
    expect(classifyCommandForDiet('pnpm vitest run packages/core')).toBe('js-test');
    expect(classifyCommandForDiet('npx jest --ci')).toBe('js-test');
    expect(classifyCommandForDiet('pnpm --filter @wrongstack/core test')).toBe('js-test');
    expect(classifyCommandForDiet('cd app && npm run test:unit')).toBe('js-test');
    expect(classifyCommandForDiet('python -m pytest -q tests')).toBe('pytest');
    expect(classifyCommandForDiet('go test ./...')).toBe('go-test');
    expect(classifyCommandForDiet('cargo nextest run')).toBe('cargo-test');
    expect(classifyCommandForDiet('pnpm add zod')).toBe('install');
    expect(classifyCommandForDiet('pip install requests')).toBe('install');

    expect(classifyCommandForDiet('cat vitest.config.ts')).toBeNull();
    expect(classifyCommandForDiet('ls src/jest')).toBeNull();
    expect(classifyCommandForDiet('npm install test-utils')).toBe('install');
    expect(classifyCommandForDiet('git status')).toBeNull();
  });
});

describe('dietCommandOutput', () => {
  it('reduces a passing vitest run to its summary', () => {
    const result = dietCommandOutput('pnpm vitest run', passingVitest);
    expect(result).not.toBeNull();
    expect(result?.omittedLines).toBe(40);
    expect(result?.text).toContain('Tests  480 passed (480)');
    expect(result?.text).not.toContain('✓');
  });

  it('keeps failures and project frames, drops dependency frames', () => {
    const out = [
      ...Array.from({ length: 20 }, (_, i) => ` ✓ tests/ok-${i}.test.ts (3 tests) 5ms`),
      ' × tests/parse.test.ts > parses numbers 12ms',
      '   → expected 2 to be 3',
      '    at parse (D:/repo/src/parse.ts:14:9)',
      '    at runTest (D:/repo/node_modules/@vitest/runner/dist/index.js:781:11)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
      ' Tests  1 failed | 60 passed (61)',
    ].join('\n');
    const result = dietCommandOutput('vitest run', out);
    expect(result?.text).toContain('× tests/parse.test.ts > parses numbers');
    expect(result?.text).toContain('expected 2 to be 3');
    expect(result?.text).toContain('at parse (D:/repo/src/parse.ts:14:9)');
    expect(result?.text).not.toContain('node_modules');
    expect(result?.text).not.toContain('node:internal');
    expect(result?.text).toContain('1 failed | 60 passed');
  });

  it('drops go and cargo passing-test chatter', () => {
    const go = [
      ...Array.from(
        { length: 15 },
        (_, i) => `=== RUN   TestCase${i}\n--- PASS: TestCase${i} (0.00s)`,
      ),
      '--- FAIL: TestBroken (0.01s)',
      '    broken_test.go:12: want 1, got 2',
      'FAIL',
    ].join('\n');
    const goResult = dietCommandOutput('go test ./...', go);
    expect(goResult?.text).toBe(
      ['--- FAIL: TestBroken (0.01s)', '    broken_test.go:12: want 1, got 2', 'FAIL'].join('\n'),
    );

    const cargo = [
      ...Array.from({ length: 12 }, (_, i) => `test tests::case_${i} ... ok`),
      'test tests::broken ... FAILED',
      'test result: FAILED. 12 passed; 1 failed',
    ].join('\n');
    expect(dietCommandOutput('cargo test', cargo)?.text).toBe(
      'test tests::broken ... FAILED\ntest result: FAILED. 12 passed; 1 failed',
    );
  });

  it('is not applied when it would save too little', () => {
    const tiny = ' ✓ a.test.ts (1 test) 1ms\n Tests  1 passed (1)';
    expect(dietCommandOutput('vitest run', tiny)).toBeNull();
  });

  it('never touches a command it does not know', () => {
    expect(dietCommandOutput('git log', passingVitest)).toBeNull();
  });
});

describe('dietNote', () => {
  it('points at the full output when it was persisted', () => {
    const note = dietNote({ text: '', omittedLines: 3, label: 'passing tests' }, '/tmp/x.log');
    expect(note).toContain('omitted 3 line(s) of passing tests');
    expect(note).toContain('/tmp/x.log');
  });
});

describe('createCommandOutputCapture', () => {
  it('keeps the whole output while it fits', () => {
    const capture = createCommandOutputCapture(100);
    capture.push('hello ');
    capture.push('world');
    expect(capture.text()).toBe('hello world');
  });

  it('keeps the head and the tail, not only the head', () => {
    const capture = createCommandOutputCapture(50);
    capture.push('HEAD-LINE\n');
    for (let i = 0; i < 200; i++) capture.push(`noise line ${i}\n`);
    capture.push('SUMMARY: 3 failed\n');
    const text = capture.text();
    expect(text.startsWith('HEAD-LINE')).toBe(true);
    expect(text).toContain('SUMMARY: 3 failed');
    expect(text).toMatch(/chars omitted from the middle/);
    expect(capture.text()).toBe(text);
  });
});

describe('shapeCommandOutput', () => {
  it('diets before the cut so the summary survives a small cap', () => {
    const shaped = shapeCommandOutput(passingVitest, 'pnpm vitest run', { maxBytes: 400 });
    expect(shaped.diet?.omittedLines).toBe(40);
    expect(shaped.text).toContain('Tests  480 passed (480)');
    expect(shaped.text).not.toContain('truncated');
  });

  it('falls back to plain normalization for unknown commands', () => {
    const shaped = shapeCommandOutput('\u001b[31mred\u001b[0m\n', 'echo red');
    expect(shaped).toEqual({ text: 'red\n', diet: null });
  });
});

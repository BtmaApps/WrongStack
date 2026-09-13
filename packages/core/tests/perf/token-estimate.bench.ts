import { describe, test } from 'vitest';
import {
  estimateTextTokens,
  estimateToolInputTokens,
  estimateToolResultTokens,
} from '../../src/utils/token-estimate.js';

/**
 * V0-B: token estimation runs on every message during context-window checks.
 * Regressions here multiply across iterations. Sizes chosen to cover the
 * realistic range: a one-line response, a typical tool result, and a worst-
 * case dumped file.
 */

const ONE_LINE = 'hello world how are you doing today?';
const TEN_KB = 'lorem ipsum '.repeat(900); // ~10.8 KB
const HUNDRED_KB = 'lorem ipsum '.repeat(9000);
const ONE_MB = 'lorem ipsum '.repeat(90_000);

const smallToolInput = { query: 'find the bug', filter: { lang: 'ts' } };
const largeToolInput = {
  files: Array.from({ length: 200 }, (_, i) => `src/file-${i}.ts`),
  options: { recursive: true, depth: 5, exclude: ['node_modules', 'dist'] },
};

describe('estimateTextTokens', () => {
  test('one-line (≈40 chars)', async ({ bench }) => {
    await bench('one-line (≈40 chars)', () => {
      estimateTextTokens(ONE_LINE);
    }).run();
  });
  test('10 KB', async ({ bench }) => {
    await bench('10 KB', () => {
      estimateTextTokens(TEN_KB);
    }).run();
  });
  test('100 KB', async ({ bench }) => {
    await bench('100 KB', () => {
      estimateTextTokens(HUNDRED_KB);
    }).run();
  });
  test('1 MB', async ({ bench }) => {
    await bench('1 MB', () => {
      estimateTextTokens(ONE_MB);
    }).run();
  });
});

describe('estimateToolInputTokens', () => {
  // Note: this function memoizes on the input object — clone per call so the
  // cache doesn't dominate the second iteration.
  test('small input (cold)', async ({ bench }) => {
    await bench('small input (cold)', () => {
      estimateToolInputTokens({ ...smallToolInput });
    }).run();
  });
  test('large input (cold)', async ({ bench }) => {
    await bench('large input (cold)', () => {
      estimateToolInputTokens({ ...largeToolInput });
    }).run();
  });
  test('small input (warm cache)', async ({ bench }) => {
    await bench('small input (warm cache)', () => {
      estimateToolInputTokens(smallToolInput);
    }).run();
  });
});

describe('estimateToolResultTokens', () => {
  test('string result, 10 KB', async ({ bench }) => {
    await bench('string result, 10 KB', () => {
      estimateToolResultTokens(TEN_KB);
    }).run();
  });
  test('object result, 200 entries', async ({ bench }) => {
    await bench('object result, 200 entries', () => {
      estimateToolResultTokens({ matches: Array.from({ length: 200 }, (_, i) => `m${i}`) });
    }).run();
  });
});

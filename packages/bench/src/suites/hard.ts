import { createBundledLocalSuite, resolveBundledSuiteDir } from './bundled.js';

/**
 * Bundled discriminating eval. `core` saturates — a small flash model passes
 * all six — so it cannot rank models. These eight Node tasks carry the traps
 * that separate them: hidden interacting bugs, exact spec edge cases, and a
 * behavior-preserving refactor, each graded by tests the agent must not gut.
 */
export const HARD_TASK_COUNT = 8;

export function resolveHardSuiteDir(): string {
  return resolveBundledSuiteDir('hard');
}

export function createHardSuite() {
  return createBundledLocalSuite('hard');
}

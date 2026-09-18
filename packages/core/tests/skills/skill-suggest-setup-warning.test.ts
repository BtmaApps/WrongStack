/**
 * "You switched this on and it is not running" — said exactly once.
 *
 * The old behaviour was a `logger.debug` line, which in practice meant
 * silence: an operator who set `skills.suggest.enabled: true` with no key got
 * no block, no error and no hint. The opposite failure is just as real — the
 * request pipeline is rebuilt per session, so warning on every construction
 * would bury the signal in a daemon's log.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSkillSuggestionSetup } from '../../src/skills/suggest/setup.js';
import { resetWarnOnceForTests } from '../../src/typesafe/index.js';

const loader = {
  list: async () => [],
  listEntries: async () => [],
  find: async () => undefined,
  manifestText: async () => '',
  readBody: async () => '',
  readSaveBody: async () => '',
  invalidateCache: () => {},
} as never;

function deps(config: Record<string, unknown>, logger: { warn: ReturnType<typeof vi.fn> }) {
  return {
    config: { features: { skills: true }, ...config } as never,
    skillLoader: loader,
    logger: logger as never,
    env: {} as NodeJS.ProcessEnv,
  };
}

beforeEach(() => {
  resetWarnOnceForTests();
});

describe('createSkillSuggestionSetup', () => {
  it('warns once when the feature is enabled with no account', () => {
    const logger = { warn: vi.fn() };
    const config = { skills: { suggest: { enabled: true } } };

    expect(createSkillSuggestionSetup(deps(config, logger))).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[0]).toContain('skills.suggest');
    expect(logger.warn.mock.calls[0]?.[0]).toContain('TYPESAFE_API_KEY');

    // A second session in the same process must not repeat it.
    expect(createSkillSuggestionSetup(deps(config, logger))).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the feature was never switched on', () => {
    // No account and no request for one is an ordinary install, not a problem.
    const logger = { warn: vi.fn() };
    expect(createSkillSuggestionSetup(deps({}, logger))).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('stays silent when skills are off entirely', () => {
    const logger = { warn: vi.fn() };
    const built = createSkillSuggestionSetup({
      ...deps({ skills: { suggest: { enabled: true } } }, logger),
      config: { features: { skills: false }, skills: { suggest: { enabled: true } } } as never,
    });
    // Nothing to point at: the roster never reaches the prompt.
    expect(built).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

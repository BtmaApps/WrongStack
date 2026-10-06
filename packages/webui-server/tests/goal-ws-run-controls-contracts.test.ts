import { beforeEach, describe, expect, it, vi } from 'vitest';

const gitStdout = vi.hoisted(() => vi.fn());
vi.mock('../src/server/git-process.js', () => ({ gitStdout }));

import { commitsSince } from '../src/server/goal-ws-run-controls-contracts.js';

beforeEach(() => vi.resetAllMocks());

describe('goal revert commit selection', () => {
  it('preserves oldest-first commit order while discarding blank output', async () => {
    gitStdout.mockResolvedValue(' first\r\n\nsecond\n');
    await expect(commitsSince('project', 'base', 'goal/build')).resolves.toEqual([
      'first',
      'second',
    ]);
    expect(gitStdout).toHaveBeenCalledWith('project', [
      'log',
      '--reverse',
      '--format=%H',
      'base..goal/build',
    ]);
  });

  it.each([null, '', '\n\r\n'])('returns no commits for git output %j', async (output) => {
    gitStdout.mockResolvedValue(output);
    await expect(commitsSince('project', 'base', 'branch')).resolves.toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { stopAllPrompt } from '../src/lib/stop-all-prompt';

describe('stop all confirmation', () => {
  it('names the leader and every agent the stop will end', () => {
    const prompt = stopAllPrompt(true, ['Reviewer', 'Explorer']);
    expect(prompt.title).toBe('Stop the leader and all agents?');
    expect(prompt.body).toContain('The leader is still working.');
    expect(prompt.body).toContain('These agents are still running: Reviewer, Explorer.');
    expect(prompt.body).toContain('Queued messages stay paused.');
  });

  it('still warns when only the leader is running', () => {
    expect(stopAllPrompt(true, []).body).toContain('The leader is still working.');
    expect(stopAllPrompt(true, []).body).not.toContain('still running:');
  });

  it('warns about agents after the leader has finished', () => {
    expect(stopAllPrompt(false, ['Reviewer']).body).toContain(
      'This agent is still running: Reviewer.',
    );
  });
});

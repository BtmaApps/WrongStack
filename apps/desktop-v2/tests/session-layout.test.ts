import { describe, expect, it } from 'vitest';
import type { Session } from '../src/model';
import { nextSessionAfterDetach, restoreSessionTabs } from '../src/session-layout';

const sessions = ['alpha', 'beta', 'gamma'].map((id) => ({ id }) as Session);
describe('native session tabs', () => {
  it('restores valid tabs in order and migrates a selected session from the initial layout format', () => {
    expect(restoreSessionTabs({ selected: 'beta' }, sessions)).toEqual(['beta']);
    expect(
      restoreSessionTabs(
        { openSessionIds: ['gamma', 'missing', 'alpha', 'gamma', 7], selected: 'beta' },
        sessions,
      ),
    ).toEqual(['gamma', 'alpha', 'beta']);
  });
  it('drops stale selection and handles absent or malformed persisted tabs', () => {
    expect(restoreSessionTabs({ selected: 'missing', openSessionIds: 'bad' }, sessions)).toEqual(
      [],
    );
    expect(restoreSessionTabs({}, [])).toEqual([]);
  });
  it('selects the adjacent tab when detaching the foreground session and leaves background selection alone', () => {
    expect(nextSessionAfterDetach(['alpha', 'beta', 'gamma'], 'beta', 'beta')).toBe('gamma');
    expect(nextSessionAfterDetach(['alpha', 'beta'], 'beta', 'beta')).toBe('alpha');
    expect(nextSessionAfterDetach(['alpha'], 'alpha', 'alpha')).toBeNull();
    expect(nextSessionAfterDetach(['alpha', 'beta'], 'beta', 'alpha')).toBe('beta');
  });
});

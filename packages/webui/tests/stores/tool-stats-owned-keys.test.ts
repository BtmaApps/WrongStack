import { afterEach, describe, expect, it } from 'vitest';
import { sessionInFlight, useToolStatsStore as store } from '../../src/stores/tool-stats-store.js';

afterEach(() => store.getState().clearAll());
describe('tool statistics own keys', () => {
  it.each(['constructor', '__proto__', 'toString', 'ordinary'])(
    'counts session/tool/agent named %s',
    (id) => {
      store.getState().clearAll();
      store.getState().recordToolStarted(id, { name: id, agentName: id });
      expect(store.getState().sessions[id]?.perTool[id]?.started).toBe(1);
      expect(sessionInFlight(store.getState().sessions[id]!)).toBe(1);
      store.getState().recordToolExecuted(id, { name: id, agentName: id, ok: true, durationMs: 5 });
      expect(store.getState().sessions[id]?.perAgent[id]?.totalMs).toBe(5);
      expect(sessionInFlight(store.getState().sessions[id]!)).toBe(0);
      expect(Object.keys(JSON.parse(JSON.stringify(store.getState().sessions)))).toEqual([id]);
      store.getState().resetSession(id);
      const before = store.getState();
      before.resetSession(id);
      expect(store.getState()).toBe(before);
    },
  );
});

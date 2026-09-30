/**
 * The provider/model pairs running right now: every open session tab, the
 * session in front (and the config pair that mirrors it), and every running
 * subagent. The side panel shows only the
 * quota these draw on; the Plan Quota page marks them.
 *
 * Each store is reduced to a string inside its selector, so a streaming turn
 * — which rewrites the lanes on every token — re-renders nothing unless a
 * provider or model actually changed.
 */

import { useMemo } from 'react';
import { useConfigStore, useFleetStore, useSessionStore, useSessionTabStore } from '@/stores';
import { useSessionLanes } from '@/stores/session-lanes';
import type { ModelInUse } from './quota-model';

const FIELD = '\t';
const ROW = '\n';

function pair(provider: string | undefined, model: string | undefined): string {
  return provider ? `${provider}${FIELD}${model ?? ''}` : '';
}

export function useModelsInUse(): ModelInUse[] {
  const openTabIds = useSessionTabStore((s) => s.openTabIds);
  const tabsKey = useSessionLanes((s) =>
    openTabIds
      .map((id) => pair(s.lanes[id]?.session?.provider, s.lanes[id]?.session?.model))
      .join(ROW),
  );
  const activeKey = useSessionStore((s) => pair(s.session?.provider, s.session?.model));
  const agentsKey = useFleetStore((s) => {
    const rows: string[] = [];
    for (const agent of s.agents.values()) {
      if (agent.status === 'running') rows.push(pair(agent.provider, agent.model));
    }
    return rows.sort().join(ROW);
  });
  // The config pair mirrors the tab in front (session switches write it), and
  // before any session reports it is what the next turn will run on.
  const configKey = useConfigStore((s) => pair(s.provider, s.model));

  return useMemo(() => {
    const rows = [tabsKey, activeKey, configKey, agentsKey].join(ROW).split(ROW).filter(Boolean);
    const unique = [...new Set(rows)];
    return unique.map((row) => {
      const [provider = '', model = ''] = row.split(FIELD);
      return { provider, model };
    });
  }, [tabsKey, activeKey, agentsKey, configKey]);
}

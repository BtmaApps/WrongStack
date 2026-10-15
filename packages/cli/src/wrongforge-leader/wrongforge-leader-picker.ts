/**
 * The machine's WrongForge as a pickable provider for the WebUI: `wrongforge`,
 * with the models it serves. It has no saved record and no models.dev entry,
 * so the WebUI pickers only offer it through this list.
 *
 * The WebUI asks synchronously, so this reads the cached `/v1/info` list and
 * refreshes the cache in the background for the next look.
 */
import type { PickableHostProvider } from '../acp-leader/acp-leader-picker.js';
import { resolveWrongForgeEndpoint, WRONGFORGE_AGENT_ID } from '../fleet/wrongforge-client.js';
import { readCachedWrongForgeInfo, refreshWrongForgeInfoCache } from '../fleet/wrongforge-info.js';

/** The `wrongforge` entry, or none when no WrongForge is set up here or its models are unknown. */
export function wrongForgeLeaderPickable(): PickableHostProvider[] {
  const ep = resolveWrongForgeEndpoint();
  if (!ep) return [];
  refreshWrongForgeInfoCache(ep);
  const info = readCachedWrongForgeInfo();
  if (!info) return [];
  return [
    {
      id: WRONGFORGE_AGENT_ID,
      type: WRONGFORGE_AGENT_ID,
      models: info.models.map((id) => ({
        id,
        name: id === info.defaultModel ? `${id} (WrongForge default)` : id,
        description: 'WrongForge leading the session',
      })),
    },
  ];
}

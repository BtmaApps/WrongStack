import type { ToolRegistry } from '../registry/tool-registry.js';
import type { ConfigStore } from '../types/config/root.js';
import type { Tool } from '../types/tool.js';
import { resolveTypeSafeJudge } from '../typesafe/judgments.js';
import { createJevStatusTool, createJevTool } from './jev-tool.js';

/** Keep discovery and prompt tool sets in sync with live account/feature settings. */
export function registerJevTools(registry: ToolRegistry, store: ConfigStore): () => void {
  const getConfig = () => store.get();
  const register = (tool: Tool) => {
    registry.register(tool);
    // Host tool surfaces can already be narrowed before these optional tools arrive.
    registry.exposeToProvider(tool.name);
    const config = getConfig().tools;
    if (config?.disabledTools?.includes(tool.name)) {
      registry.disable(tool.name);
      const meta = config.disabledToolMeta?.[tool.name];
      if (meta) registry.applyDisabledMeta({ [tool.name]: meta });
    }
  };
  register(createJevStatusTool(getConfig, () => registry.isDisabled('jev')));
  const tool = createJevTool(getConfig);
  const sync = () => {
    // Transient health is checked by status/execute; retain discovery during cooldowns.
    const configured = !!resolveTypeSafeJudge({ config: getConfig(), feature: 'tool' });
    if (configured && !registry.ownerOf('jev')) register(tool);
    else if (!configured) registry.unregister('jev');
  };
  sync();
  return store.watch(sync);
}

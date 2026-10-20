// Per-plugin detail data for the plugin detail pages.
// Generated from packages/plugins/src/*/index.ts, packages/core/src/plugins/*,
// packages/plug-lsp, packages/telegram, and packages/plugins/README.md.
// Keys match pluginCatalog entry names in ./runtime-catalog.ts.

import type { PluginDetail } from './plugin-detail-types';
import { pluginDetailsPart1 } from './plugin-details-part-1';
import { pluginDetailsPart2 } from './plugin-details-part-2';
import { pluginDetailsPart3 } from './plugin-details-part-3';
import { pluginDetailsPart4 } from './plugin-details-part-4';
import { pluginDetailsPart5 } from './plugin-details-part-5';
import { pluginDetailsPart6 } from './plugin-details-part-6';
import { workflowPluginDetails } from './plugin-details-workflows';

export type { PluginDetail } from './plugin-detail-types';

export const pluginDetails: Record<string, PluginDetail> = {
  'wstack-specialist-triggers': {
    version: '1.0.0',
    apiVersion: '^0.1',
    longDescription:
      'Opt-in file-pattern triggers for roster specialists. After changed paths settle, deterministic glob rules emit fleet.specialist_needed and the CLI host dispatches bounded background workers. The plugin registers /specialist-triggers for inspecting rules and counters, but fires nothing until explicitly enabled. It respects the session subagent policy, deduplicates role/path sets and caps both concurrent and per-session work.',
    tools: [],
    hooks: ['iteration.completed', 'session.ended'],
    configOptions: [
      {
        name: 'enabled',
        type: 'boolean',
        defaultValue: 'false',
        description: 'Opt in to automatic specialist dispatch.',
      },
      {
        name: 'rules',
        type: 'SpecialistTriggerRule[]',
        description: 'Replace the shipped glob rules; an empty list disables all rules.',
      },
      {
        name: 'extraRules',
        type: 'SpecialistTriggerRule[]',
        defaultValue: '[]',
        description: 'Append rules to the selected rule set.',
      },
      {
        name: 'debounceMs',
        type: 'number',
        defaultValue: '20000',
        description: 'Quiet window before a changed path set fires.',
      },
      {
        name: 'maxConcurrent',
        type: 'number',
        defaultValue: '2',
        description: 'Maximum specialists in flight from this plugin.',
      },
      {
        name: 'maxPerSession',
        type: 'number',
        defaultValue: '8',
        description: 'Total trigger budget across rules in one session.',
      },
    ],
    example: '/specialist-triggers',
  },
  ...pluginDetailsPart1,
  ...pluginDetailsPart2,
  ...pluginDetailsPart3,
  ...pluginDetailsPart4,
  ...pluginDetailsPart5,
  ...pluginDetailsPart6,
  ...workflowPluginDetails,
};

import { defineLazyAgentPrompt } from './agent-prompts.js';
import { type AgentDefinition, LIGHT_BUDGET, TOOLS } from './types.js';

/**
 * Phase 3 · Tech Stack — dependency version watchdog.
 *
 * Automatically triggered when package manifests (package.json, go.mod, etc.)
 * are created or edited. Detects the ecosystem, looks up latest versions from
 * registries, and sends warning messages to the agent that last touched the
 * file (or broadcasts if unknown).
 *
 * Tools: read (manifests), fetch (registry APIs), mailbox (send warnings).
 */
export const TECHSTACK_AGENTS: AgentDefinition[] = [
  {
    // The only definition whose prompt file name differs from its role, and the
    // only phase array `index.ts` does NOT fold into `ALL_AGENT_DEFINITIONS` —
    // so it never passes through `assignSkillsToAgents`, where every catalog
    // role gets its lazy prompt accessor. It installs its own, naming the
    // watchdog brief explicitly: role `tech-stack` is the single-shot validator
    // in the catalog proper, and the two prompts must stay distinct.
    config: defineLazyAgentPrompt(
      {
        id: 'tech-stack',
        name: 'TechStack',
        role: 'tech-stack',
        tools: [...TOOLS.read, 'fetch', 'mailbox'],
      },
      'tech-stack-watchdog',
    ),
    budget: LIGHT_BUDGET,
    capability: {
      phase: 'build',
      summary:
        'Dependency version watchdog: monitors package manifests, looks up latest versions from registries, and warns authors about outdated packages.',
      keywords: [
        'tech-stack',
        'dependency',
        'version',
        'outdated',
        'package.json',
        'go.mod',
        'cargo.toml',
        'registry',
        'npm',
        'pypi',
        'crates',
      ],
    },
  },
];

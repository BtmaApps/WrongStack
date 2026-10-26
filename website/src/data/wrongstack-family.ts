/** Product roles and links verified against the projects' own READMEs. */
export const familyProducts = [
  {
    id: 'wrongstack',
    name: 'WrongStack',
    role: 'Orchestrate',
    category: 'Coding orchestration',
    status: 'Flagship',
    license: 'MIT',
    href: 'https://github.com/WrongStack/WrongStack',
    docsHref: 'https://github.com/WrongStack/WrongStack/tree/main/docs',
    licenseHref: 'https://github.com/WrongStack/WrongStack/blob/main/LICENSE',
    description:
      'Plan the work, coordinate specialist agents and keep tools, permissions and execution under one governed workflow.',
    capabilities: ['Multi-agent coordination', 'Tools, skills & MCP', 'Terminal & web'],
  },
  {
    id: 'wrongforge',
    name: 'WrongForge',
    role: 'Execute',
    category: 'Standalone agent runtime',
    status: 'Experimental',
    license: 'MIT',
    href: 'https://github.com/WrongStack/WrongForge',
    docsHref: 'https://github.com/WrongStack/WrongForge/blob/main/docs/INTEGRATION.md',
    licenseHref: 'https://github.com/WrongStack/WrongForge/blob/main/LICENSE',
    description:
      'Run a Claude-powered agent through a chat REPL or HTTP task API. Stream task progress, work with shell and files, and connect MCP tools from a single executable.',
    capabilities: [
      'HTTP task API & live events',
      'Chat REPL & dashboard',
      'Orchestrator tool gateway',
    ],
  },
  {
    id: 'wrongtrace',
    name: 'WrongTrace',
    role: 'Observe',
    category: 'Agent & code observability',
    status: 'Companion',
    license: 'BUSL-1.1',
    href: 'https://github.com/WrongStack/WrongTrace',
    docsHref: 'https://github.com/WrongStack/WrongTrace#readme',
    licenseHref: 'https://github.com/WrongStack/WrongTrace/blob/master/LICENSE',
    description:
      'Trace AST-level code changes, agent activity and model telemetry. Explore symbol history, code collisions and runtime traces in an embedded dashboard served by a Go binary.',
    capabilities: [
      'AST churn & symbol lineage',
      'Agent, model & token telemetry',
      'MCP, IPC & runtime traces',
    ],
  },
] as const;

/** Curated public release copy; the version guard requires a refresh on every release. */
export const releaseHighlights = {
  version: '1.2.0',
  title: 'See the work. Shape the workspace.',
  summary:
    'Live model-output activity now reaches the CLI, TUI, SimpleUI and WebUI with shared token, speed and phase readouts. VibeUI adds Cozy, Just chat and Studio views, a personal file shelf and richer explorers, while stronger trust boundaries and companion budgets keep agent work grounded and productive.',
  socialDescription:
    'WrongStack 1.2.0: live model-output activity across four interfaces, a calmer VibeUI with file shortcuts, practical companion budgets and stronger trust boundaries.',
  cards: [
    {
      title: 'Live output, one shared language',
      body: 'CLI, TUI, SimpleUI and WebUI show estimated live tokens, throughput, elapsed time and model or tool phases. Provider usage reconciles completed responses when available.',
      href: '/interfaces',
      linkLabel: 'Compare the interfaces',
    },
    {
      title: 'A VibeUI that fits your pace',
      body: 'Choose Cozy chat, Just chat or Studio without losing your session or draft. Pin handy files, revisit recent work and browse Library and Memory in richer views.',
      href: '/interfaces',
      linkLabel: 'Explore VibeUI and the surfaces',
    },
    {
      title: 'Agents with clearer boundaries',
      body: 'Companions get practical working budgets, while memories, repository content, skills and queued previews stay untrusted evidence—not authority over your request or safety rules.',
      href: '/security',
      linkLabel: 'Review the security model',
    },
  ],
} as const;

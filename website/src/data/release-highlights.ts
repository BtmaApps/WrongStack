/** Curated public release copy; the version guard requires a refresh on every release. */
export const releaseHighlights = {
  version: '1.3.0',
  title: 'Keep the context. Measure the work.',
  summary:
    'Desktop v2 adds durable project drafts, file and line references, and review-bound file writes. Benchmarks gain resumable runs and a six-tool lean profile, while Quick prompts and explicit AGENTS.md controls keep context focused.',
  socialDescription:
    'WrongStack 1.3.0: durable Desktop v2 workspaces, reviewed file changes, resumable benchmarks with six-tool lean profiles, and focused Quick prompts.',
  cards: [
    {
      title: 'Project work that survives a restart',
      body: 'Desktop v2 keeps unsent roster, model, skill and project form drafts. File references can quote selected lines, and file saves check the disk version you reviewed.',
      href: '/interfaces',
      linkLabel: 'Compare the interfaces',
    },
    {
      title: 'Benchmarks with bounded context',
      body: 'Compare models and prompt variants, resume unfinished runs, and retry failed task groups. The lean harness exposes six file and shell tools with a fingerprint that records the measured setup.',
      href: '/features',
      linkLabel: 'Explore benchmark capabilities',
    },
    {
      title: 'Choose the instructions you need',
      body: 'The Quick system prompt and separate global and project AGENTS.md switches make instruction scope explicit. Shared process helpers preserve command quoting and filter child environments.',
      href: '/features',
      linkLabel: 'See the feature set',
    },
  ],
} as const;

/** Curated public release copy; the version guard requires a refresh on every release. */
export const releaseHighlights = {
  version: '1.1.14',
  title: 'Map the codebase. Trace the change.',
  summary:
    'Four new tools connect repository structure, change impact, execution flows and onboarding. CodeMap 2.0 makes those relationships navigable, while a durable mission anchor keeps follow-ups aligned with the user’s request.',
  socialDescription:
    'WrongStack 1.1.14: polyglot codebase intelligence, four new tools, CodeMap 2.0 and durable mission continuity, with Git isolation and release security fixes.',
  cards: [
    {
      title: 'Repository atlas and change impact',
      body: 'codebase-atlas maps hubs and Louvain subsystem communities; codebase-diff-impact connects a change to the parts of the repository it can affect.',
      href: '/tools/codebase-atlas',
      linkLabel: 'Explore the codebase atlas',
    },
    {
      title: 'Execution flows and onboarding',
      body: 'codebase-flow-trace follows execution paths. codebase-onboard builds a dependency-ordered architectural tour from hubs, subsystem clusters and primary flows.',
      href: '/tools/codebase-flow-trace',
      linkLabel: 'Inspect execution flow tracing',
    },
    {
      title: 'CodeMap 2.0',
      body: 'Navigate shortest paths, inspect hop-based blast-radius rings, collapse subsystem clusters and start a guided tour or execution-flow trace from the WebUI.',
      href: '/features/code-intelligence',
      linkLabel: 'See code intelligence in context',
    },
  ],
} as const;

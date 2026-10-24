/** Curated public release copy; the version guard requires a refresh on every release. */
export const releaseHighlights = {
  version: '1.1.16',
  title: 'Prove it. Fix it. Ship it.',
  summary:
    'Six proof-driven hunt modes run beside /bughunt: each loads its playbook skills, proves one defect per round with a failing reproduction on current code, fixes it surgically and clears a verify-before-done quality gate. Kanban git_diff check notes now fail closed on malformed input.',
  socialDescription:
    'WrongStack 1.1.16: six proof-driven hunt modes beside /bughunt, fail-closed kanban git_diff check notes and single-run vitest worker sizing.',
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

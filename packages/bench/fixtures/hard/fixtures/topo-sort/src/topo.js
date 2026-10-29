export class CycleError extends Error {}

/**
 * Order the nodes of a dependency graph. See the task prompt for the full contract.
 *
 * @param {Record<string, string[]>} graph
 * @returns {string[]}
 */
export function topoSort(graph) {
  return Object.keys(graph);
}

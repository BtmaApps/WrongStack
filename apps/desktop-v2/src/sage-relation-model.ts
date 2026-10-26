import { record } from './engine-values';
export interface SageFlowNode extends Record<string, unknown> {
  id: string;
  label: string;
  kind: string;
  status: string;
  recordId?: string;
  detail: string;
}
export function sageRelationModel(memories: Record<string, unknown>[], relations: unknown[]) {
  const nodes = new Map<string, SageFlowNode>();
  for (const memory of memories) {
    if (typeof memory['id'] !== 'string') continue;
    const id = 'mem:' + memory['id'];
    nodes.set(id, {
      id,
      recordId: memory['id'],
      label: String(memory['preview'] ?? memory['text'] ?? memory['id']).slice(0, 120),
      kind: String(memory['kind'] ?? 'record'),
      status: String(memory['status'] ?? ''),
      detail: 'Revision ' + String(memory['revision'] ?? 1),
    });
  }
  const edges = new Map<
    string,
    { id: string; source: string; target: string; label: string; weight: number }
  >();
  for (const value of relations) {
    const edge = record(value);
    if (
      typeof edge['from'] !== 'string' ||
      typeof edge['to'] !== 'string' ||
      !edge['from'] ||
      !edge['to']
    )
      continue;
    const source = edge['from'],
      target = edge['to'],
      label = String(edge['relation'] ?? 'related');
    for (const id of [source, target])
      if (!nodes.has(id)) {
        const colon = id.indexOf(':');
        nodes.set(id, {
          id,
          ...(id.startsWith('mem:') ? { recordId: id.slice(4) } : {}),
          label: colon >= 0 ? id.slice(colon + 1) : id,
          kind: colon >= 0 ? id.slice(0, colon) : 'resource',
          status: '',
          detail: id,
        });
      }
    const id = source + '→' + target + ':' + label;
    edges.set(id, { id, source, target, label, weight: Number(edge['weight'] ?? 1) });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

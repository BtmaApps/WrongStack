import { rows, text } from './session';

/** Graph responses also include anchor neighbors: retain only this record's own links. */
export function directMemoryEdges(id: string, edges: unknown) {
  const root = `mem:${id}`;
  const seen = new Set<string>();
  return rows(edges).filter((edge) => {
    const from = text(edge.from);
    const to = text(edge.to);
    if (!from || !to || from === to || (from !== root && to !== root)) return false;
    const key = JSON.stringify([from, to, text(edge.relation) || text(edge.type)]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function memoryDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return 'Not reported';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not reported' : date.toLocaleString();
}

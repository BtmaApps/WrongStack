import { record, rows, text } from './session';

export function resourceId(tab: string, item: Record<string, unknown>) {
  return tab === 'prompts' ? text(item.slug) : text(item.name);
}
export function resourceMatches(item: Record<string, unknown>, query: string) {
  return [
    item.title,
    item.name,
    item.description,
    item.category,
    item.owner,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}
export function promptVariables(value: unknown) {
  return rows(value)
    .filter((v) => text(v.name))
    .map((v) => ({
      name: text(v.name),
      description: text(v.description),
      required: v.required === true,
      defaultValue: text(v.default),
      options: Array.isArray(v.enum)
        ? v.enum.filter((item): item is string => typeof item === 'string')
        : [],
    }));
}
export function fillPrompt(content: string, values: Record<string, string>) {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name]! : whole,
  );
}
export function promptSlug(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'prompt'
  );
}
export function resourceDetails(tab: string, payload: Record<string, unknown>) {
  if (tab === 'skills') return text(payload.body);
  if (tab === 'prompts') return text(payload.content);
  return text(record(payload).description);
}
export function memoryWindow(content: string, query: string, page: number, pageSize = 16000) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? content
        .split('\n')
        .filter((line) => line.toLowerCase().includes(q))
        .join('\n')
    : content;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.max(0, Math.min(pages - 1, page));
  return {
    content: filtered.slice(current * pageSize, (current + 1) * pageSize),
    total: filtered.length,
    pages,
    page: current,
  };
}

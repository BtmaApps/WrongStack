/** Wire-payload coercion helpers shared by the session reducer and its views. */
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];
export const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
export const contentText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : rows(value)
        .filter((block) => block.type === 'text')
        .map((block) => text(block.text))
        .join('\n\n');
export const bounded = (value: string) => value.slice(-500_000);

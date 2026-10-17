export function SearchHighlight({ value, query }: { value: string; query: string }) {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!terms.length) return value;
  const pattern = new RegExp(
    terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'giu',
  );
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) parts.push(value.slice(cursor, start));
    parts.push(
      <mark className="search-hit" key={start}>
        {match[0]}
      </mark>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}

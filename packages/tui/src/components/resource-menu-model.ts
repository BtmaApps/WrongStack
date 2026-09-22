// Pure resource-menu filtering (no Ink/React), shared by the view and reducer.
import type { ResourceMenuItem, ResourceMenuSnapshot } from '../ui-contracts.js';

export function filterResourceMenuItems(
  snapshot: ResourceMenuSnapshot,
  filter: string,
): ResourceMenuItem[] {
  const query = filter.trim().toLowerCase();
  if (!query) return snapshot.items;
  return snapshot.items.filter((item) =>
    [
      item.label,
      item.summary ?? '',
      item.body ?? '',
      ...item.details.flatMap((detail) => [detail.label, detail.value]),
    ].some((value) => value.toLowerCase().includes(query)),
  );
}

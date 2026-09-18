/** Shared by native view placement and the renderer's CSS grid. */
export const SIDEBAR_WIDTH_WIDE = 292;
export const SIDEBAR_WIDTH_MEDIUM = 276;
export const SIDEBAR_WIDTH_NARROW = 252;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

export function getSidebarWidth(windowWidth: number, collapsed: boolean): number {
  if (collapsed) return SIDEBAR_WIDTH_COLLAPSED;
  if (windowWidth < 900) return SIDEBAR_WIDTH_NARROW;
  if (windowWidth < 1180) return SIDEBAR_WIDTH_MEDIUM;
  return SIDEBAR_WIDTH_WIDE;
}

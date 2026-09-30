/**
 * Re-exports for view-navigation helpers used by the App shell.
 *
 * These were historically re-exported from `./ActivityBar.tsx` (the
 * component file), which made the component file a non-leaf hub:
 * anything that wanted a navigation helper got the entire 569-line
 * component file as a transitive dependency, and any future split
 * of the component file would silently break re-export sites.
 *
 * This file is the canonical (and only) place where the
 * component-shells-needs-these navigation helpers are exposed.
 * The navigation helpers themselves remain in `@/lib/view-navigation`
 * — this is a thin re-export surface, not a definition site.
 */

export type { MainView, PanelMainView } from '@/lib/view-navigation';
export {
  ACTIVITY_SHORTCUT_BY_KEY,
  ACTIVITY_SHORTCUT_LABEL_BY_ACTIVITY,
  navigateToView,
  openAgentsSurface,
  openMainView,
  openPanel,
  pairedViewForActivity,
  shortcutLabelForActivity,
  showPanel,
} from '@/lib/view-navigation';

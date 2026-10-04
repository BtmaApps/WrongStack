/**
 * Hint shown when the right sidebar can't be hidden because at least one
 * F-key panel is routed to it — the sidebar is that panel's only home.
 * Mirrors the render-side clamp in `app-ui-state.ts#resolveSidebarLayout`
 * and the slash-command guards in `use-tui-slash-commands.ts`.
 */
export const SIDEBAR_PINNED_HINT =
  'Sidebar pinned on: a panel is routed to the sidebar — set it to bottom first';

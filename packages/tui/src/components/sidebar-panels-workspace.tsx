/**
 * Sidebar twins of the workspace F-key panels. Each twin lives in its own
 * `sidebar-panel-<name>.tsx` module; this barrel keeps the historical import
 * path stable for `sidebar-panels.tsx` and tests.
 */

export { AgentsPanelSidebar, type AgentsPanelSidebarProps } from './sidebar-panel-agents.js';
export {
  ConnectionsPanelSidebar,
  type ConnectionsPanelSidebarProps,
} from './sidebar-panel-connections.js';
export {
  CoordinatorPanelSidebar,
  type CoordinatorPanelSidebarProps,
} from './sidebar-panel-coordinator.js';
export { FleetPanelSidebar, type FleetPanelSidebarProps } from './sidebar-panel-fleet.js';
export { ProjectPickerSidebar, type ProjectPickerSidebarProps } from './sidebar-panel-project.js';
export { WorktreePanelSidebar, type WorktreePanelSidebarProps } from './sidebar-panel-worktree.js';
export {
  WrongProxyPanelSidebar,
  type WrongProxyPanelSidebarProps,
} from './sidebar-panel-wrong-proxy.js';

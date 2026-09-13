/**
 * Lazy view router. Each surface is its own chunk so opening the Cockpit does
 * not download React Flow, Monaco-sized markdown pipelines or the QR encoder.
 */
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import type { HqViewId } from '../../data/store/index.js';

export const HQ_VIEW_COMPONENTS: Record<HqViewId, LazyExoticComponent<ComponentType>> = {
  cockpit: lazy(() => import('../../views/cockpit.js').then((m) => ({ default: m.CockpitView }))),
  fleet: lazy(() =>
    import('../../views/fleet/index.js').then((m) => ({ default: m.FleetMapView })),
  ),
  console: lazy(() =>
    import('../../views/console/index.js').then((m) => ({ default: m.LiveConsoleView })),
  ),
  mailbox: lazy(() =>
    import('../../views/mailbox/index.js').then((m) => ({ default: m.MailboxView })),
  ),
  kanban: lazy(() =>
    import('../../views/kanban/index.js').then((m) => ({ default: m.KanbanView })),
  ),
  approvals: lazy(() =>
    import('../../views/approvals.js').then((m) => ({ default: m.ApprovalsView })),
  ),
  alerts: lazy(() => import('../../views/alerts.js').then((m) => ({ default: m.AlertsView }))),
  cost: lazy(() => import('../../views/cost.js').then((m) => ({ default: m.CostView }))),
  trends: lazy(() => import('../../views/trends.js').then((m) => ({ default: m.TrendsView }))),
  // W5 #19 (RFC hq-improvements-2026-09.md): Event Log timeline view. Filterable
  // archive of every telemetry envelope from every machine. The Record
  // exhaustiveness forces a router entry for every HqViewId; missing this
  // entry is a compile error.
  events: lazy(() => import('../../views/events.js').then((m) => ({ default: m.EventsView }))),
  brain: lazy(() => import('../../views/brain.js').then((m) => ({ default: m.BrainView }))),
  worktree: lazy(() =>
    import('../../views/worktree.js').then((m) => ({ default: m.WorktreeView })),
  ),
  control: lazy(() =>
    import('../../views/control/index.js').then((m) => ({ default: m.ControlView })),
  ),
  settings: lazy(() =>
    import('../../views/settings/index.js').then((m) => ({ default: m.SettingsView })),
  ),
};

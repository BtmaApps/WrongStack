/**
 * Typed veriyolu for opening SimpleUI panels over `window` events.
 *
 * Panels listen for their open event because they live in different subtrees
 * (topbar-triggered modals, workspace launcher, command palette actions).
 * Centralizing the event names here turns a typo from a silently dead button
 * into a compile error, and documents the whole surface in one place.
 */

export const SIMPLE_PANEL_EVENTS = [
  'open-brain-panel',
  'open-file-explorer',
  'open-file-diff',
  'open-memory-drawer',
  'open-mailbox',
  'open-prompt-library',
  'open-settings',
  'open-context-breakdown',
  'open-session-health',
  'open-vector-memory-panel',
  'close-vector-memory-panel',
] as const;

export type SimplePanelEvent = (typeof SIMPLE_PANEL_EVENTS)[number];

export type WorkspacePanelView = 'tools' | 'todos' | 'tasks' | 'plan' | 'flow';
export type PanelActivation =
  | Exclude<SimplePanelEvent, 'close-vector-memory-panel'>
  | `workspace:${WorkspacePanelView}`;

const PANEL_ACTIVATED_EVENT = 'simpleui:panel-activated';

function eventName(event: SimplePanelEvent): string {
  return `simpleui:${event}`;
}

function activatePanel(panel: PanelActivation): void {
  window.dispatchEvent(new CustomEvent<PanelActivation>(PANEL_ACTIVATED_EVENT, { detail: panel }));
}

/** Dispatch a panel open/close event. Opening one surface closes its peers. */
export function dispatchSimplePanel(event: SimplePanelEvent): void {
  if (event !== 'close-vector-memory-panel') activatePanel(event);
  window.dispatchEvent(new Event(eventName(event)));
}

/** Subscribe to a panel event; returns an unsubscribe function. */
export function onSimplePanel(event: SimplePanelEvent, listener: () => void): () => void {
  const name = eventName(event);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/** Observe an exclusive panel activation so independently owned panels cannot overlap. */
export function onPanelActivation(listener: (panel: PanelActivation) => void): () => void {
  const handler = (event: Event): void => {
    const panel = (event as CustomEvent<unknown>).detail;
    if (typeof panel === 'string') listener(panel as PanelActivation);
  };
  window.addEventListener(PANEL_ACTIVATED_EVENT, handler);
  return () => window.removeEventListener(PANEL_ACTIVATED_EVENT, handler);
}

/** Open the right-side workspace launcher on a specific view. */
export function dispatchOpenWorkspacePanel(view: WorkspacePanelView): void {
  activatePanel(`workspace:${view}`);
  window.dispatchEvent(new CustomEvent('simpleui:open-workspace-panel', { detail: { view } }));
}

/** Subscribe to workspace launcher opens; returns an unsubscribe function. */
export function onOpenWorkspacePanel(listener: (view: WorkspacePanelView) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<{ view?: unknown }>).detail;
    if (detail && typeof detail.view === 'string') {
      listener(detail.view as WorkspacePanelView);
    }
  };
  window.addEventListener('simpleui:open-workspace-panel', handler);
  return () => window.removeEventListener('simpleui:open-workspace-panel', handler);
}

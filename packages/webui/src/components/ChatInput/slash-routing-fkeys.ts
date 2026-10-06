import { openMainView, showPanel } from '@/lib/view-navigation';
import { useUIStore } from '@/stores';
import type {
  ChatAssistantMessage,
  SlashRoutingClient,
  SlashRoutingWs,
} from './slash-routing-types.js';

/**
 * `/f`, `/f1` … `/f12` — the TUI's F-key panels mapped onto WebUI store
 * actions. `/f` with no (or an unknown) argument lists the panels.
 */
export function runFKeyPanelCommand(
  cmd: string,
  args: string,
  client: SlashRoutingClient | null | undefined,
  ws: SlashRoutingWs,
  addMessage: (message: ChatAssistantMessage) => void,
): boolean {
  const panelMap: Record<string, string> = {
    '/f': '',
    '/f1': 'sessionPanel',
    '/f2': 'fleetMonitor',
    '/f3': 'agentsMonitor',
    '/f4': 'worktreeMonitor',
    '/f5': 'planPanel',
    '/f6': 'todosMonitor',
    '/f7': 'queuePanel',
    '/f8': 'processList',
    '/f9': 'goalPanel',
    '/f10': 'sessionsPanel',
    '/f11': 'coordinatorMonitor',
    '/f12': 'statuslinePicker',
  };
  const panel = cmd === '/f' && args ? panelMap[`/f${args.trim()}`] : panelMap[cmd];
  if (!panel) {
    // /f with no args — show the list
    const lines = [
      '🎛️  **F-key panels**',
      '',
      '/f 1 — Session panel',
      '/f 2 — Fleet orchestration monitor',
      '/f 3 — Agents live monitor',
      '/f 4 — Worktree monitor',
      '/f 5 — Plan panel',
      '/f 6 — Todos monitor overlay',
      '/f 7 — Queue panel',
      '/f 8 — Process list overlay',
      '/f 9 — Goal panel',
      '/f 10 — Live sessions panel',
      '/f 11 — Coordinator monitor',
      '/f 12 — Status line picker',
      '',
      '_Or use /f1 … /f12 directly._',
    ];
    addMessage({ role: 'assistant', content: lines.join('\n') });
    return true;
  }
  // Dispatch to the appropriate WebUI store action
  const ui = useUIStore.getState();
  showPanel('chat');
  ui.setDockCustomizeOpen(false);
  if (panel === 'sessionPanel') {
    showPanel('chat');
    return true;
  }
  if (panel === 'fleetMonitor') {
    ui.setFleetMonitorOpen(true);
    return true;
  }
  if (panel === 'agentsMonitor') {
    ui.setAgentsMonitorOpen(true);
    return true;
  }
  if (panel === 'worktreeMonitor') {
    ui.setChangesPanelTab('worktrees');
    showPanel('changes');
    ui.setDockSection('worktrees');
    return true;
  }
  if (panel === 'planPanel') {
    ws.getPlan();
    ui.setDockSection('work');
    ui.setWorkDashboardTab('plan');
    return true;
  }
  if (panel === 'todosMonitor') {
    ui.setDockSection('work');
    ui.setWorkDashboardTab('todos');
    return true;
  }
  if (panel === 'queuePanel') {
    ui.setQueuePanelOpen(true);
    return true;
  }
  if (panel === 'processList') {
    ui.setProcessMonitorOpen(true);
    return true;
  }
  if (panel === 'goalPanel') {
    client?.send?.({ type: 'goal.get' });
    showPanel('chat');
    ui.setDockSection('goal-state');
    return true;
  }
  if (panel === 'sessionsPanel') {
    ws.listSessions(50);
    showPanel('chat');
    return true;
  }
  if (panel === 'coordinatorMonitor') {
    ui.setAgentRosterActiveTab('officemap');
    openMainView('roster');
    return true;
  }
  if (panel === 'statuslinePicker') {
    showPanel('chat');
    ui.setDockSection('work');
    ui.setDockCustomizeOpen(true);
    return true;
  }
  return true;
}

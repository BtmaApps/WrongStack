import type { ReactNode } from 'react';
import { MonitorShell, PanelInputProvider } from './monitor-shell.js';

/** Pin a slash command's decision controls while its explanation scrolls. */
export function SlashModalFrame({
  title,
  accent,
  children,
  footer,
}: {
  title: string;
  accent: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <PanelInputProvider value={true}>
      <MonitorShell title={title} accent={accent} icon="" footer={footer}>
        {children}
      </MonitorShell>
    </PanelInputProvider>
  );
}

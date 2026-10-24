import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PresentationProvider } from '../components/presentation-mode';
import { WorkspacePreferencesProvider } from '../components/workspace-preferences';
import '@xyflow/react/dist/style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'VibeUI · WrongStack',
  description: 'A little less interface. A little more building.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const backendPort =
    process.env.NODE_ENV === 'development' ? process.env.WRONGSTACK_BACKEND_PORT || '3477' : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {backendPort && <meta name="wrongstack-ws-url" content={`ws://127.0.0.1:${backendPort}`} />}
      </head>
      <body>
        <PresentationProvider>
          <WorkspacePreferencesProvider>{children}</WorkspacePreferencesProvider>
        </PresentationProvider>
      </body>
    </html>
  );
}

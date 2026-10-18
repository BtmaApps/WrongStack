import { ThemeProvider } from 'next-themes';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AmbientMotionProvider } from './components/site/AmbientMotionProvider';
import './index.css';
import { RouterProvider } from './lib/router';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <AmbientMotionProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </AmbientMotionProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

// Type declarations for CSS and font imports used by the webui client bundle.
// These are resolved by Vite at build time but TypeScript needs a stub for DTS generation.

declare module '*.css' {
  const css: string;
  export default css;
}

// Self-hosted font packages: eager imports in main.tsx, lazy loaders in lib/fonts.ts.
declare module '@fontsource-variable/*' {
  const _: string;
  export default _;
}

declare module '@fontsource/*' {
  const _: string;
  export default _;
}

// Non-standard, Chromium-only memory metrics. Augmented as optional so the
// DebugDashboard heap widget type-checks; it is `undefined` on Firefox/Safari
// and the UI must treat it as unavailable rather than show a misleading 0.
interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

// Vite define replacement — true in development, false in production.
declare const __DEV__: boolean;

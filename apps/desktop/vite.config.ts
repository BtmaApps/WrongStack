import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Pin an empty inline PostCSS config so Vite never searches the filesystem
  // for `postcss.config.*` — that search climbs past the workspace root to the
  // drive root and dies on any stray entry there. See `packages/simpleui`.
  css: { postcss: {} },
  base: './',
  root: path.resolve(__dirname, 'src/renderer'),
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
  },
});

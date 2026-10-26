import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  css: { postcss: {} },
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  clearScreen: false,
  build: { target: 'es2022' },
});

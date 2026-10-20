import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: '../.temp_files/website-responsive/test-results',
  workers: 3,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4179',
    browserName: 'chromium',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [320, 375, 390, 768, 1024, 1280, 1440, 1920, 2560].map((width) => ({
    name: `${width}px`,
    use: { viewport: { width, height: 1000 } },
  })),
  webServer: {
    command: 'bun run build && bun run preview --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

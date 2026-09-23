import { defineConfig } from '@playwright/test';
export default defineConfig({outputDir:'./test-results/storefront',
  testDir: './tests/e2e', timeout: 45000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['list']],
  webServer: { command: `${JSON.stringify(process.execPath)} node_modules/next/dist/bin/next start --hostname 127.0.0.1`, url: 'http://127.0.0.1:3000', reuseExistingServer: false, timeout: 60000 },
});

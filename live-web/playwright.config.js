import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  use: { baseURL: 'http://127.0.0.1:5179', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5179 --strictPort',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})

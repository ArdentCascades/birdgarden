import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:4321',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Astro server before tests (requires a built + seeded site)
  webServer: {
    command: 'bun run start',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
    },
  },
});

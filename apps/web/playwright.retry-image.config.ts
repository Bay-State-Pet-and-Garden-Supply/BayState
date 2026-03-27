import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__',
  testMatch: ['**/e2e/retry-image-404.spec.ts'],
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});

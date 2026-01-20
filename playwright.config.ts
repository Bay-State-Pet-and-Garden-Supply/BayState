import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration for all available options.
 */
export default defineConfig({
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI until we have stable a11y results.
  retries: process.env.CI ? 2 : 0,

  // Workers number to use for parallelization.
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use for test output.
  reporter: 'list',

  // Global timeout for each test.
  timeout: 30000,

  // Expect timeout for assertions like `await expect()`.
  expect: {
    timeout: 5000,
  },

  // Shared settings for all projects.
  use: {
    // Base URL for navigation.
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',

    // Storage state for auth bypass - loaded per project.
    storageState: undefined,

    // Custom headers for E2E test mode auth bypass.
    extraHTTPHeaders: {
      // Only set auth bypass header when in test mode.
      ...(process.env.E2E_TEST_MODE === 'true' && {
        'x-e2e-user': 'user', // Default to user role; can be overridden per test
      }),
    },

    // Capture screenshot on failure for debugging a11y violations.
    screenshot: 'only-on-failure',

    // Trace recording for debugging.
    trace: 'on-first-retry',
  },

  // Output directory for test artifacts (screenshots, traces, violation reports).
  outputDir: 'test-results/',

  // Projects to run tests against.
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Desktop viewport - full browser window.
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-375x812',
      use: {
        ...devices['iPhone 13 Pro'],
        // Explicit mobile viewport: 375x812 (iPhone SE / modern small phones)
        viewport: { width: 375, height: 812 },
        // Mobile-specific settings.
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  // Web server configuration for local development.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // Timeout for the server to start.
    timeout: 120000,
  },

  // Configure folders to search for test files.
  testDir: './__tests__',

  // Configure test file patterns.
  testMatch: '**/a11y/**/*.spec.ts',

  // Configure paths to ignore.
  ignoreSnapshots: true,
});

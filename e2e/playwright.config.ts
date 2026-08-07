import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * This project has no wired backend yet (see ../backend/CONVENTIONS.md and
 * ../CLAUDE.md) — the frontend runs entirely against its own Mock*Service
 * implementations. baseURL and webServer point at the Angular dev server
 * only; there is nothing on the backend for these tests to stand up yet.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/login')`. */
    baseURL: 'http://localhost:4200',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Boot the Angular dev server before running tests, unless one is already up. */
  webServer: {
    command: 'npm start',
    cwd: '../frontend',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

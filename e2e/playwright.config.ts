import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * This suite runs against the real stack, end to end. `webServer` brings up
 * the local docker-compose stack in `../infrastructure/local` — the frontend
 * production-built and served by nginx, the ASP.NET Core API, and Keycloak
 * holding employee credentials — and every sign-in below is a real password
 * grant against that identity provider. Nothing is mocked or stubbed on this
 * side; see CONVENTIONS.md's Scope.
 *
 * The frontend is served at http://localhost:4200 by the stack's `web`
 * service, so `baseURL` is unchanged from when this config booted the Angular
 * dev server — but it is now the production bundle, which is what
 * CONVENTIONS.md asks for.
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

  /*
   * Wait for the realm import to finish before the first spec runs. The stack
   * being started is not the stack being ready — see global-setup.ts for the
   * measured window and why this is a poll rather than a sleep.
   */
  globalSetup: './global-setup.ts',

  /*
   * A sign-in is a real round trip now — the API exchanges the credential for
   * a token with Keycloak, then reads `userinfo` — rather than a mock's fixed
   * delay. This raises how long an assertion waits for the app to catch up; it
   * does not change what any assertion requires.
   */
  expect: {
    timeout: 15_000,
  },

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

  /*
   * Bring the whole stack up — `web`, `api`, and `id` together — so `npm test`
   * needs no manual step. This is the same command `infrastructure/README.md`
   * documents for a developer.
   */
  webServer: {
    command: 'docker compose up --build',
    cwd: '../infrastructure/local',

    /*
     * Readiness in two parts, because one URL cannot express it. This waits
     * for the frontend to be served; `globalSetup` then waits for Keycloak's
     * realm import, which finishes later and is the gate that actually matters
     * for a sign-in.
     */
    url: 'http://localhost:4200',

    /*
     * Sized for a cold start, because a CI runner is always cold. A cold
     * `docker compose up --build` takes several minutes on a developer machine
     * (measured 2026-09-17): it pulls five base images, compiles the Angular
     * production bundle, and publishes the API. A warm start skips only the
     * build. The old 120s budget was sized for an Angular dev server.
     *
     * Hitting this is a real failure worth reading the build log over, not
     * something to nudge upward reflexively.
     */
    timeout: 900_000,

    /*
     * Never on CI: a developer's half-configured or stale stack must not serve
     * a CI run. Locally, reusing a stack that is already up is the difference
     * between a few seconds and a few minutes per run.
     */
    reuseExistingServer: !process.env.CI,

    /*
     * Surface the build and container output. With Playwright's default of
     * `ignore`, a multi-minute cold build prints nothing and looks like a
     * hang.
     */
    stdout: 'pipe',
    stderr: 'pipe',

    /*
     * Give `docker compose up` the SIGTERM it needs to stop the containers it
     * started, rather than being killed outright and leaving them running.
     */
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 60_000,
    },
  },
});

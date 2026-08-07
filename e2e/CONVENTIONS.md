# E2E Conventions

> Architect-owned. This document is optional but load-bearing: the E2E
> Specialist reads it and follows it (see
> `intent-to-production/agents/specialist-e2e.md`, "Read the surface's
> conventions spec, if one exists... it overrides your defaults"). What you
> put here is what your generated e2e code will look like. Effort in,
> quality out. Iterate it like code.

## Status

This is a brand-new surface — there is no prior `e2e/CONVENTIONS.md` to
extend, and `tests/login/login.spec.ts` is the only spec that exists today.
Treat it as the one worked example, not as a large body of precedent.

**Scope, stated explicitly:** the frontend runs entirely on its own
`Mock*Service` implementations today — there is no real backend wired up
(`backend/CONVENTIONS.md`: auth isn't configured server-side; persistence is
undecided). Every flow this suite tests goes through those mocks. What
happens to this suite once a real backend lands is **deliberately left
open** — not this document's decision, and not something to guess at now.

## Orientation

Start at `playwright.config.ts`, then `tests/login/login.spec.ts` — that
spec is the reference shape for everything below: accessible locators,
`test.describe`, tags, and assertions against URL/visible text rather than
implementation details.

## Runtime & tooling

- **`@playwright/test`** with TypeScript, config in `playwright.config.ts`.
- **Chromium only** for now — matches Playwright's own CI-cost guidance
  (install only the browsers you need). Firefox/WebKit projects are left
  commented out in `playwright.config.ts`, ready to enable later; this is
  not a permanent decision, just today's.
- `playwright.config.ts`'s `webServer` block boots the frontend's own dev
  server (`npm start` in `../frontend`, `http://localhost:4200`) — there is
  nothing on the backend for this config to stand up.
- **`@playwright/cli`** is also a dev dependency — a separate,
  token-efficient browser-control CLI built for coding agents, distinct
  from the `@playwright/test` framework above. Run
  `npx playwright-cli install --skills` to install its skill files locally
  for whichever coding agent picks up this repo. See
  https://playwright.dev/docs/getting-started-cli. It's a tool available to
  reach for, not a requirement for writing a spec.

## Project structure

```
e2e/
  tests/
    <feature>/
      <feature>.spec.ts     # one folder per feature (login/, sale/, ...)
  fixtures/
    credentials.ts          # e2e-owned test data
    auth.ts                 # shared authenticatedPage fixture
```

**Folder-per-feature under `tests/`.** One folder per feature
(`tests/login/`, and so on as new flows are covered), not a flat list of
`*.spec.ts` files at the top level.

**A single `fixtures/` directory, not a `pages/` Page-Object-Model
directory.** Reusable locators, actions, and test data live in
`fixtures/` as plain functions, constants, and Playwright fixtures — see
"Test architecture" below for why POM was declined.

## Test architecture

**Lightweight fixtures and helpers, not Page Object Model.** No
`LoginPage`/`SalePage`-style classes wrapping locators and actions. Specs
call Playwright locators and assertions directly, or use a shared fixture
(`fixtures/auth.ts`'s `authenticatedPage`) for setup that would otherwise
repeat across specs. This was a deliberate choice against full POM, which
adds a class per page and more indirection than this suite's size
justifies today.

## Selector strategy

**Accessible locators only** — `getByRole`, `getByLabel`, `getByText`. No
CSS selectors, no XPath, no `data-testid` attributes added to the
frontend. The app's existing markup already has proper `<label for=...>`
associations and semantic roles (buttons, alerts) — write against what a
user actually sees and interacts with, not the DOM shape.

## Auth in tests

`MockAuthService` keeps sign-in state in a plain in-memory signal — nothing
is written to `localStorage` or a cookie (confirmed in
`frontend/src/app/mocks/mock-auth.service.ts` and
`frontend/src/app/core/auth/auth.guard.ts`). Playwright's usual
`storageState`-reuse pattern (log in once, replay the saved session) has
nothing to capture here.

Every test needing an authenticated page uses the shared
`authenticatedPage` fixture in `fixtures/auth.ts`, which drives the real
login form. It is still a real UI login on every test that uses it — the
fixture only removes the boilerplate from each spec, not the login itself.

## Test data

**e2e owns its own test data, decoupled from the frontend's mocks.**
`fixtures/credentials.ts` defines `CASHIER_CREDENTIALS` and `INVALID_PIN`
as e2e's own constants. Even where these values match
`mock-auth.service.ts`'s accepted credentials today, do not import from
`frontend/src/app/mocks/*` — a demo-data change made for frontend/UX
reasons should not silently break an e2e spec, and a change to e2e's own
test data should be a deliberate edit in `fixtures/`, not a side effect of
someone else's change elsewhere.

## Tagging

**`@smoke` / `@regression` tags, adopted from day one** via Playwright's
`test(title, { tag: '@smoke' }, ...)` annotation — see
`tests/login/login.spec.ts` for both tags in use. `npm run test:smoke` runs
only smoke-tagged tests. Adopted now, ahead of the pain it solves, so the
convention is already in place as the suite grows rather than retrofitted
later.

## CI

`.github/workflows/e2e.yml` runs on every push to `main` and every pull
request touching `e2e/**` or `frontend/**`: installs frontend and e2e
dependencies, installs the Chromium browser, runs the suite, and uploads
the HTML report as a build artifact. This is ahead of `frontend.yml` and
`backend.yml`, which are still checkout-only stubs with no test execution
wired up — that gap is real, not a reason to hold e2e back, since a
specialist's own PR triggering a real CI run is the actual point either
way.

## Never in this codebase

- No XPath selectors.
- No `page.waitForTimeout()` or other arbitrary sleeps.
- No asserting on internal component state or CSS classes in place of
  visible, user-facing behavior.
- No `test.skip()` as a fix for a flaky test — a flaky test gets fixed or
  deleted, never silenced.

## Deliberately the E2E Specialist's call

Internal structure within a spec file — how a flow breaks down into
`test.step()` calls, local variable naming, and whether a given flow
becomes one test or several — is not covered by this document. Decide it
per spec; don't ask.

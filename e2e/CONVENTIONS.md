# E2E Conventions

> Architect-owned and required, not optional: a specialist dispatched into a
> surface with no conventions spec stops and reports rather than proceeding
> (see `intent-to-production/agents/specialist-e2e.md`'s "Read the surface's
> conventions spec" instruction). What you put here is what your generated
> e2e code will look like. Effort in, quality out. Iterate it like code.

## Status

This is a brand-new surface — there is no prior `e2e/CONVENTIONS.md` to
extend. `tests/login/login.spec.ts` is the only spec that exists today, and
it is real, worked precedent, not a placeholder — treat it as the one
worked example, not as a large body of precedent to generalize from.

**Scope, stated explicitly:** the frontend and this suite are both meant to
be totally real, production-built — nothing rigged up on this side, ever.
The backend is what's selectively faked, and only in what logic serves a
response (an in-memory collection vs. a hardcoded response), never in
whether an endpoint exists — every endpoint the frontend needs, exists.

**This is now literally true of the suite, not just an intention.** The
frontend is served to these tests as a production bundle behind nginx, from
the local docker-compose stack in `../infrastructure/local`, and the suite
stands that stack up itself — see Runtime & tooling. Booting the Angular dev
server, which this config did until LET-122, never satisfied the
production-built requirement above.

Auth is real: sign-in goes through the API to Keycloak, and `AUTH_SERVICE` is
wired to the real `AuthService` in `app.config.ts`. The remaining features
(buyer, payment, product, sales) still run on their `Mock*Service` — that's a
bootstrapping state, not the target one. **Once a feature's real backend
endpoints are wired into the frontend, this suite's flows for that feature go
through the real backend automatically** — there is no separate "wire e2e up
to the real backend" step to wait for, and no gate to ask about.

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
- `playwright.config.ts`'s `webServer` block brings up the **whole stack** —
  `docker compose up --build` in `../infrastructure/local`, running the
  production-built frontend at `http://localhost:4200`, the API, and Keycloak
  together. `baseURL` is unchanged; what serves it is not. **Docker is a hard
  requirement for running this suite.**
- **Readiness is two gates, and a fixed sleep is never one of them.**
  `webServer` waits for the frontend to answer; `global-setup.ts` then polls
  the realm's OIDC discovery document until it answers `200`. Keycloak's
  container reports up roughly 25 seconds before its realm import completes,
  and **a sign-in attempted inside that window is rejected as an invalid
  credential** — it presents as a code failure rather than a timing one.
  Anything new that depends on the stack being ready polls for a real signal
  the same way.
- The `webServer` timeout is sized for a **cold** start, because a CI runner
  is always cold: images are built, the Angular production bundle compiled,
  the API published. Treat hitting it as a real failure to read the build log
  over, not a number to nudge upward.
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
  global-setup.ts           # waits for the stack's realm import before any spec
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

**Auth is real.** Sign-in posts to the API, which resolves the credential
against Keycloak by OIDC password grant and then reads the employee's role,
department, and job function from `userinfo`. `MockAuthService` is no longer
wired into the running app — it survives only as a test double inside the
frontend's own specs. A credential that only ever worked against the mock
authenticates against nothing here.

**Every authenticated test still drives the real login form. `storageState`
reuse is not viable, and this is now a settled answer rather than an open
question.** The reason changed but the conclusion didn't: `AuthService` holds
the signed-in employee in an in-memory `signal<Employee | null>` and writes
nothing to `localStorage` or a cookie (`core/auth/auth.service.ts`). There is
no client-side session artifact for Playwright to capture and replay, so
logging in once and reusing the state would capture an empty profile. Revisit
this only if the frontend starts persisting the session client-side — a
browser reload signing the employee back in is the observable tell.

Use the shared `authenticatedPage` fixture in `fixtures/auth.ts` rather than
repeating login steps inline. It is parameterized by employee, defaulting to
the Associate:

```ts
import { test, expect } from '../../fixtures/auth';
import { STORE_MANAGER } from '../../fixtures/credentials';

test.use({ employee: STORE_MANAGER });

test('...', async ({ authenticatedPage }) => { /* already signed in */ });
```

Parameterized by **employee**, not by role, because two seeded employees share
the `Associate` role and differ only by job function — and job function is
what decides that employee's nav tail. `EMPLOYEES_BY_ROLE` is there when a
spec genuinely wants to select by role.

**A sign-in that fails inside the fixture fails the test there, loudly**, with
the login screen's own error message attached. Handing back an
unauthenticated page makes some later assertion fail somewhere confusing, and
the real cause then gets diagnosed as a nav bug. Anything new that
authenticates keeps that property.

Every role lands on `/sale` after sign-in: it is a shared nav item every role
earns, so the route gate never turns anyone away from it. That is why one
post-sign-in assertion works for all of them.

## Test data

**e2e owns its own test data, decoupled from every other surface.**
`fixtures/credentials.ts` defines the seeded employees and `INVALID_PIN` as
e2e's own constants. Do not import from `frontend/src/app/mocks/*` — a
demo-data change made for frontend/UX reasons should not silently break an
e2e spec, and a change to e2e's own test data should be a deliberate edit in
`fixtures/`, not a side effect of someone else's change elsewhere.

**The credentials are now a mirror, and the realm export is the original.**
The employees in `fixtures/credentials.ts` are the ones seeded into
`../infrastructure/local/keycloak/team-targe-realm.json`, and they only
authenticate because that file seeds them. The decoupling rule above still
holds — this surface keeps its own copy rather than importing across the
surface boundary — but the two have to agree, and the realm export wins when
they don't. These five are fixed by their story's table, not demo data anyone
may retune. `INVALID_PIN` is deliberately a PIN no seeded employee has;
paired with a real Employee ID it exercises a rejected credential rather than
an unknown user.

## Test levels

**This surface runs exactly one level: flow tests through a real browser.**
No unit tests and no integration tests live in `e2e/`.

**What "flow test" means here:** a full user journey through the running
Angular app in a real Chromium browser — navigate, interact via accessible
locators, assert on visible text and URL. Not a component test (no
`TestBed`, no mounting in isolation) and not an API test: a spec drives the
browser and never calls the API or Keycloak directly, even though both are
now running and reachable. The one exception is `global-setup.ts`, which
polls the identity provider to decide when the stack is ready — readiness
plumbing, not coverage.

**How it's invoked:** `npm test` runs the whole suite headless. `npm run
test:smoke` runs only `@smoke`-tagged tests (see Tagging, below) for a
faster subset. `npm run test:ui` / `test:headed` / `test:debug` are
interactive variants for local development, not CI. See CI, below, for how
this runs in GitHub Actions.

**What this surface deliberately does not test, because something else
covers it:** component- and service-level behavior (signal logic, form
validation, individual component rendering) is the frontend's own Vitest
suite's job — see `frontend/CONVENTIONS.md`'s Testing style section. This
surface does not duplicate that coverage; it only tests behavior visible
across a full navigated flow.

**What this surface owes / depends on:** nothing tests `e2e/` from above —
it is the top of this repo's test pyramid today, so "what does this surface
owe the surfaces that test it" doesn't apply to this document. The real
dependency runs the other way: this suite's selector strategy (see above)
depends on the frontend maintaining accessible markup — a real `<label
for>` association and a real button role for every interactive element it
locates by. `frontend/CONVENTIONS.md`'s own Test levels section now states
this as a hard requirement on its side — this document doesn't restate it,
just names the dependency.

## Tagging

**`@smoke` / `@regression` tags, adopted from day one** via Playwright's
`test(title, { tag: '@smoke' }, ...)` annotation — see
`tests/login/login.spec.ts` for both tags in use. `npm run test:smoke` runs
only smoke-tagged tests. Adopted now, ahead of the pain it solves, so the
convention is already in place as the suite grows rather than retrofitted
later.

## CI

`.github/workflows/e2e.yml` **now exists** (LET-127). Until then this section
described it in the present tense and the file had never been written — the
same failure mode as the docker-compose claim that cost LET-106 nine days.
What follows is what the workflow does, checked against the file.

It runs on every push to `main` and every pull request touching `e2e/**`,
`frontend/**`, `backend/**`, `infrastructure/local/**`, or the workflow
itself, plus `workflow_dispatch`. **That list is wider than this section used
to claim, and deliberately so.** Since LET-122 the suite stands up the whole
stack, so the API and the compose stack can break it as easily as the
frontend can — `backend/**` is the most likely source of a break, not an
edge case. It stops at `infrastructure/local/**` rather than
`infrastructure/**` because the rest of that surface is the CDKTF AWS
application, which this suite never runs.

The job installs the e2e dependencies with `npm ci`, installs **Chromium
only** (`npx playwright install --with-deps chromium`, per Runtime & tooling
above), and runs `npm test`. It does **not** install frontend dependencies —
an earlier version of this section said it did, and that has not been true
since LET-122: the frontend is compiled into the `web` image by
`docker compose`, not built on the runner.

**The workflow is one command, because `playwright.config.ts` already does
the CI-shaped work.** `webServer` brings the stack up, `globalSetup` polls the
realm, `globalTeardown` stops it. The workflow consumes all three rather than
restating any of them as shell steps — a second way to stand the stack up
would diverge from the local one, and the local one is the tested one.
Specifically: no sleep, no wait step, and no health-check loop belongs in the
workflow, and neither does `--shard` or a `workers` override (see
`fullyParallel` in `playwright.config.ts` for why the suite is serial).

The HTML report and the trace files upload as a build artifact
(`playwright-report/` and `test-results/`) **on failure as well as success**.
A report that survives only a green run is missing exactly when it is needed.

The job runs on a plain `ubuntu-latest` runner, not a container job:
`tests/identity/corporate-unreachable.spec.ts` and `global-teardown.ts` both
invoke the `docker compose` CLI from the test process, so Docker has to be on
the job's own PATH. Its timeout is **30 minutes**, against a ~21-minute worst
legitimate case (`webServer`'s 900s cold-build budget plus `globalSetup`'s
180s realm poll plus install and suite). A timeout tuned like a unit-test
job's would kill a slow cold build and report it as a test failure.

`CI` is left set, which every GitHub runner does by default and the workflow
also states explicitly. Four things key off it — teardown, `retries: 2`,
`reuseExistingServer`, and `forbidOnly` — and all four fail quietly rather
than loudly without it.

**One caveat worth carrying:** `retries: 2` on CI can hide the realm-readiness
race. A run that fails once and passes on the retry reports green. If this job
ever passes only on a retry, that is a finding to report, not a pass — read
the log for `Realm ready after …s.` before the first spec and `Stack stopped.`
at the end.

The sibling workflows are no longer stubs either: `frontend.yml` (LET-124),
`backend.yml` (LET-125), and `infrastructure.yml` (LET-126) all install their
toolchain and run their surface's real checks.

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

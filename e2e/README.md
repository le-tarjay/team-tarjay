# Team Targét E2E

Playwright end-to-end tests for Le Targét POS. Tests exercise the Angular
frontend (`../frontend`) the way a user does — no backend is wired up yet
(see `../backend/CONVENTIONS.md`), so today every flow runs against the
frontend's own `Mock*Service` implementations.

See `CONVENTIONS.md` at this folder's root for this project's house rules —
architect-owned, read it before writing a new spec.

## Project structure

```
tests/<feature>/<feature>.spec.ts   # one folder per feature
fixtures/                           # e2e-owned test data + Playwright fixtures
                                     # (no page-object classes — see CONVENTIONS.md)
```

## Setup

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
```

## Running tests

```bash
npm test           # headless, CI-style
npm run test:smoke # only @smoke-tagged tests
npm run test:ui    # interactive UI mode
npm run test:headed
npm run test:debug
npm run report     # open the last HTML report
```

`playwright.config.ts`'s `webServer` block starts `frontend`'s dev server
(`npm start`, `http://localhost:4200`) automatically if one isn't already
running — you don't need to `ng serve` by hand first.

## Generating tests

```bash
npm run codegen
```

Opens `http://localhost:4200` and records interactions as Playwright code —
useful as a starting point, not a substitute for writing against user-facing
behavior per this folder's conventions.

## Agent tooling

This project also carries `@playwright/cli` as a dev dependency — a
token-efficient browser-control CLI built for coding agents (Claude Code,
the Agent SDK, etc.), distinct from the `@playwright/test` framework above.
It's what the E2E Specialist (see `intent-to-production/agents/specialist-e2e.md`)
can reach for to interactively explore the running app or debug a flow
without writing a full spec file first:

```bash
npx playwright-cli install --skills
```

installs skill files locally so a coding agent picked up by this repo can
discover its commands. See https://playwright.dev/docs/getting-started-cli.

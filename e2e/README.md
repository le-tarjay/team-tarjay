# Team Targét E2E

Playwright end-to-end tests for Le Targét POS. Tests exercise the Angular
frontend (`../frontend`) the way a user does, against the real stack: the
suite stands up the local docker-compose runtime in `../infrastructure/local`
— the frontend production-built and served by nginx, the ASP.NET Core API,
and Keycloak as the identity provider — and signs in with real credentials
against a real realm. Sign-in is not mocked. Features whose backend
endpoints are not wired into the frontend yet still run against that
feature's `Mock*Service`; auth is not one of them.

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

**Docker is required.** The suite brings the stack up itself, so a machine
without a working `docker compose` cannot run it at all.

## Running tests

```bash
npm test           # headless, CI-style
npm run test:smoke # only @smoke-tagged tests
npm run test:ui    # interactive UI mode
npm run test:headed
npm run test:debug
npm run report     # open the last HTML report
```

### The stack the suite runs against

`playwright.config.ts`'s `webServer` block runs `docker compose up --build`
in `../infrastructure/local`, bringing up all three services together — you
don't need to start anything by hand first:

| Service | What it serves | URL |
| -- | -- | -- |
| `web` | The frontend, production build behind nginx, proxying `/v1/*` to `api` | `http://localhost:4200` |
| `api` | The ASP.NET Core API, published directly as well as proxied | `http://localhost:5080` |
| `id` | Keycloak, realm `team-targe` imported at start | `http://localhost:8080` |

Two waits, not one, because a started stack is not a ready stack:

1. `webServer` waits for the frontend to answer on `http://localhost:4200`.
2. `global-setup.ts` then polls
   `http://localhost:8080/realms/team-targe/.well-known/openid-configuration`
   until it answers `200`. Keycloak's container reports up roughly 25 seconds
   before `--import-realm` finishes, and **a sign-in inside that window is
   rejected as an invalid credential** — it looks like a code bug and isn't
   one. This is why there is no fixed sleep anywhere in the suite.

A cold run builds images and takes several minutes; the `webServer` timeout
is sized for that. A warm run skips the build. Locally the suite reuses a
stack that is already up; on CI it never does, so a half-configured local
stack can't serve a CI run.

**After a local run the stack is still up, deliberately.** That is what makes
the next run warm, and it means the suite never stops a stack you started for
your own work. Stop it yourself with `docker compose down` in
`../infrastructure/local`; the suite prints that reminder when it finishes. On
CI, `global-teardown.ts` stops it for you — explicitly, rather than by
signalling `docker compose`, which does not stop containers on Windows.

Sign-in uses the realm's seeded employees, mirrored in
`fixtures/credentials.ts`. `10041` / `4417` is the Associate; see that file
for one per role plus the Customer Support case.

To drive the stack yourself — to watch a flow in a browser, or to read a
container's logs — see `../infrastructure/README.md` ("Local runtime").

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

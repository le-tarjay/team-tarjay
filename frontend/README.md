# point-of-sale-ui

> *The terminal at the end of every guest's journey. Oui, we call them guests.*

The point-of-sale interface for Le Targét in-store checkout operations, and one surface of the Team Targét monorepo. Built with Angular. Every architectural decision is intentional and annotated — this repo is as much about how it's built as what it builds.

---

## What This Is

This is the UI a Le Targét cashier sees when checking out a guest. It handles the full checkout flow — scanning items, managing a cart, applying discounts, processing tender, and issuing a receipt — entirely in the browser.

There is a backend, and it is real. Sign-in runs against an ASP.NET Core API and a Keycloak identity provider, both of which start with the local stack — see Getting Started. Features whose endpoints do not exist yet still run on the mock layer in `src/app/mocks/`; that is a bootstrapping state, not the target one, and `CONVENTIONS.md` records which features are which.

The goal was always to build the frontend right — state management, component architecture, routing, reactive patterns — so that connecting a real backend would be an integration task rather than a rewrite. Auth was the first feature to make that trip.

---

## What This Is Not

This is not a prototype. It is not a sandbox. It is not a "good enough for demo day" application.

It is a production-minded Angular application. The standards are the same for a feature running against the real API as for one still on a mock.

---

## Why Le Targét

Le Targét is a fictional enterprise created by [Kisasa](https://kisasa.io) to demonstrate real architectural thinking in a concrete, recognizable context. Real companies have complex systems. Toy apps don't. Le Targét gives us the complexity without the NDA.

This repo is one piece of a larger fictional ecosystem. The decisions made here — naming conventions, state management patterns, component boundaries — are made with that ecosystem in mind.

---

## Architectural Philosophy

A few opinions that shaped this codebase, and why they matter:

**State is owned, not scattered.**
Cart state, session state, and UI state are distinct concerns and are treated as such. Mixing them is how frontends become unmaintainable.

**Mocks are first-class citizens.**
Until a feature's real endpoints exist, its mock is real code — typed, structured, and replaceable. A mock that is a mess is technical debt. A mock that is clean is a contract. When the endpoints land, the mock stays on as that feature's test double and nothing else has to change.

**Components have one job.**
A component that does too much is a component that can't be tested, can't be reused, and can't be understood at a glance. When in doubt, split it.

**Annotations are part of the codebase.**
Inline comments in this repo explain *why*, not *what*. If the code already says what it does, the comment has nothing to add. If a decision was made for a non-obvious reason, that reason is documented where the decision lives.

---

## Getting Started

```bash
git clone https://github.com/le-tarjay/team-tarjay.git
cd team-tarjay/frontend
npm install
```

There are two ways to run the app, and they are not interchangeable.

**The whole stack**, which is what the e2e suite drives and the closest thing to production:

```bash
cd ../infrastructure/local
docker compose up --build
```

That serves the production build at `http://localhost:4200`, with the API and Keycloak behind it. Keycloak imports its realm a few seconds after the containers report up, so a sign-in attempted immediately may be rejected — wait for `http://localhost:8080/realms/team-targe/.well-known/openid-configuration` to answer.

**The inner loop**, for working on this surface with live reload. It needs the API and Keycloak but deliberately **not** the stack's own `web` service: that one publishes port 4200, which is the port `ng serve` wants, and `ng serve` refuses to start while it is held. Bring up the API — Compose starts Keycloak alongside it — and serve the frontend yourself:

```bash
cd ../infrastructure/local
docker compose up -d api    # starts `id` too, via depends_on; leaves `web` down
cd ../../frontend
ng serve
```

If the whole stack is already running, `docker compose stop web` frees the port.

Navigate to `http://localhost:4200` — now the dev server rather than nginx. The application reloads on file changes, and `proxy.config.json` forwards `/v1` to the API on port 5080. Without the API running, sign-in fails with a generic error rather than the offline one: the dev-server proxy answers a refused connection with a 500, and `AuthService` reserves its offline message for status 0. That is correct behaviour in all three components, not a bug.

Seeded employee credentials are in `infrastructure/README.md`.

```bash
ng test    # unit suite (Vitest)
ng build   # production build
```

---

## Project Structure

```
src/
├── app/
│   ├── core/          # Singletons: services, DI tokens, guards, app-shell layout
│   ├── features/      # One folder per routed page, matching app.routes.ts
│   ├── shared/        # Presentational components used by 2+ features
│   └── mocks/         # Mock*Service implementations of the I*Service interfaces
├── index.html
├── main.ts
└── styles.scss
```

Structure decisions are documented in `CONVENTIONS.md`, alongside this file.

---

## Documentation

`CONVENTIONS.md` — the rules for writing code in this surface. Read it before making a change.

**Architectural Decision Records** live in Linear rather than in this repository: "ADR: Store Backend System Design" and "ADR: Associate Roles, Permissions, and Identity State (Frontend)". Every significant structural decision has one.

A Le Targét domain glossary — what a "tender type" is, what "guest" means — does not exist yet.

---

## Built With

- [Angular](https://angular.io) — framework
- [TypeScript](https://www.typescriptlang.org) — language
- More specifics in `package.json`

---

## Maintainers

Built under the direction of [Kisasa](https://kisasa.io) as part of the Le Targét reference architecture project.

*Kisasa is a software modernization company. Le Targét is how they show their work.*

---

*Le Targét. Modernization, but make it chic.*

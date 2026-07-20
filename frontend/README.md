# point-of-sale-ui

> *The terminal at the end of every guest's journey. Oui, we call them guests.*

A frontend-only point-of-sale interface for Le Targét in-store checkout operations. Built with Angular. No backend. Every architectural decision is intentional and annotated — this repo is as much about how it's built as what it builds.

---

## What This Is

This is the UI a Le Targét cashier sees when checking out a guest. It handles the full checkout flow — scanning items, managing a cart, applying discounts, processing tender, and issuing a receipt — entirely in the browser.

There is no backend. There is no API. Where data would normally come from a service, it comes from structured mocks and stubs designed to be swapped out when the time comes.

This is intentional. The goal is to build the frontend right — state management, component architecture, routing, reactive patterns — so that connecting a real backend later is an integration task, not a rewrite.

---

## What This Is Not

This is not a prototype. It is not a sandbox. It is not a "good enough for demo day" application.

It is a production-minded Angular application that happens to not have a backend yet. The standards are the same either way.

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
Because there is no backend, the mock layer is real code — typed, structured, and replaceable. A mock that is a mess is technical debt. A mock that is clean is a contract.

**Components have one job.**
A component that does too much is a component that can't be tested, can't be reused, and can't be understood at a glance. When in doubt, split it.

**Annotations are part of the codebase.**
Inline comments in this repo explain *why*, not *what*. If the code already says what it does, the comment has nothing to add. If a decision was made for a non-obvious reason, that reason is documented where the decision lives.

---

## Getting Started

```bash
git clone https://github.com/le-tarjay/point-of-sale-ui.git
cd point-of-sale-ui
npm install
ng serve
```

Navigate to `http://localhost:4200`. The application will reload on file changes.

---

## Project Structure

```
src/
├── app/
│   ├── core/          # Singleton services, guards, interceptors
│   ├── features/      # Feature modules (cart, tender, receipt, session)
│   ├── shared/        # Reusable components, pipes, directives
│   └── mocks/         # Structured data stubs and service fakes
├── assets/
└── environments/
```

Structure decisions are documented in `/docs/architecture`.

---

## Documentation

`/docs/architecture` — Architectural Decision Records (ADRs). Every significant structural decision has one.

`/docs/domain` — Le Targét domain glossary. What a "tender type" is, what "guest" means, why the receipt is called what it's called.

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


## runing and testing
run: ng serve
test: ng test

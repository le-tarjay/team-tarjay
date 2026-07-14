# Team Targét

**Fictional enterprise. Real architecture.**

The in-store associate app for Le Targét — sign in, build a sale, take payment, process a return, receive a shipment, fulfill a BOPIS order. Part of the Le Targét portfolio project by [Kisasa](#), built to demonstrate real software architecture through a retail enterprise that doesn't exist.

---

## What lives in this repo

Team Targét is what a Le Targét store associate actually uses on the floor. It does **not** cover:

- The public-facing Le Targét website
- Corporate-side systems — order placement, identity/API infrastructure. Deliberately a separate, later project (see the ADR, §1.1 and §17).
- [`inventory-reconciliation`](#) — a related but independent repo (Temporal-based, JWT-authenticated store edge APIs), built by [other developer].

## Start here

- **[`ADR-associate-roles-and-identity-state.md`](./ADR-associate-roles-and-identity-state.md)** — the architecture. Every role, permission, state machine, and "why we didn't do it the obvious way" decision behind this app lives here, organized by section, with rejected alternatives kept rather than deleted. Read this before touching the code.
- **`demo-build-tiering.md`** — what's actually real vs. mocked, and at what fidelity (Real / Faked+Logic / Faked+Static / Does Not Exist). The ADR describes the *design*; this tracks what's *built*. Don't infer build status from the ADR alone — check here.

## Why this exists

Team Targét isn't trying to be a finished product. It's an argument, made in working code, for how a retail associate app *should* be built: real roles instead of one flat permission level, explicit state machines instead of booleans bolted on as an afterthought, empty states instead of type systems invented to handle an edge case that a good default already covers.

The code and docs here are annotated on purpose — comments explain *why* a decision was made, not just what it does. If something looks over-engineered for a demo, it's probably the point being made, not a mistake.

## A note on naming

This repo used to be `point-of-sale-ui` — "the checkout terminal for Le Targét guests." It outgrew that name once roles, receiving, and fulfillment showed up; a POS that also schedules shifts and posts store announcements isn't a POS anymore. Full naming history, including the names that didn't make it, is in ADR §2.

## Stack

- Angular
- No backend, for now — deliberately mocked data. That's changing (ADR §1.1); timeline and design are a separate, later conversation.

## Contributing

Built as part of the Le Targét / Kisasa portfolio project. Two developers, two repos, one architecture philosophy — see the ADR for how the pieces are meant to fit together.

---

*Aim precisely. 🎯*

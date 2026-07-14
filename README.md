# Team Targét

**Fictional enterprise. Real architecture.**

The in-store associate app for Le Targét — sign in, build a sale, take payment, process a return, receive a shipment, fulfill a BOPIS order. Part of the Le Targét portfolio project by [Kisasa](#), built to demonstrate real software architecture through a retail enterprise that doesn't exist.

---

## What lives in this repo

Team Targét is what a Le Targét store associate actually uses on the floor. It does **not** cover:

- The public-facing Le Targét website
- The back-end api supporting the website

## Why this exists

Team Targét isn't trying to be a finished product. It's an argument, made in working code, for how a retail associate app *should* be built: real roles instead of one flat permission level, explicit state machines instead of booleans bolted on as an afterthought, empty states instead of type systems invented to handle an edge case that a good default already covers.

The code and docs here are annotated on purpose — comments explain *why* a decision was made, not just what it does. If something looks over-engineered for a demo, it's probably the point being made, not a mistake.

## Stack

- Angular
- C#

## Contributing

Built as part of the Le Targét / Kisasa portfolio project. Two developers, two repos, one architecture philosophy — see the ADR for how the pieces are meant to fit together.

---

*Aim precisely. 🎯*

# Team Targét Backend — Demo Build Tiering

This tracks how each piece of `ADR-backend-system-design.md` actually gets built for the demo. The ADR describes the intended real architecture and doesn't change based on this document. This document is purely about build sequencing — what's real, what's faked, and what doesn't exist yet.

**Tiers:**
- **Real** — matches the ADR's designed architecture exactly. Reserved for a select few pieces meant to showcase specific patterns. None chosen yet.
- **Faked + Logic** — in-memory state only (resets on reboot, no real persistence layer, no real corporate connection). Performs genuine computation on real input.
- **Faked + Static** — returns a believable canned or seeded response. No computation behind it.
- **Does Not Exist** — no corporate API exists yet, so there's nothing to connect to or even stub against. Gets wired in incrementally, piece by piece, once a real corporate API shows up — not a wholesale switch-over.

Anything not listed here (data-model prerequisites, Section 15) applies regardless of tier — it's shape that the Faked + Logic pieces need in order to function, not itself a tiered decision.

---

## Identity & Session (ADR §4, §8, §10)

- **Employee records (§4):** Faked + Logic. An in-memory table of employee records keyed by generated GUIDs (tier, department, name). No corporate handshake, no credential verification — "login" is a lookup against this table.
- **Roles & permissions enforcement (§10):** Faked + Logic. Real tier × department × function checks, run against the in-memory GUID table instead of anything corporate-verified.
- **Roster replica (§10):** *Is* the in-memory table above — no separate replica/sync step, since there's no corporate roster to replicate from yet.
- **Lock/Unlock (§10) and session force-out (§8):** Faked + Static. A lock flag can be set on an employee record, but nothing enforces it — no session-version check, no polling, no actual force-out. Full build-out later.

## Local Data & Real-Time (ADR §9)

- **Persistent data store:** Faked + Logic. In-memory only, resets on reboot. The relational-current-state / append-only-log split from the ADR is still followed structurally, since several Faked + Logic pieces below (Till, Store Credit, Returns) depend on summing the in-memory log.
- **Real-time/shared-state delivery (till status, held sales, fulfillment queue, announcements):** Real behavior, faked persistence. Polling against live in-memory state works exactly as designed — the mechanism itself doesn't need faking, only the data behind it is non-durable.
- **Atomic claims (BOPIS claim-next-order, Held Sale resume):** Faked + Logic. Real in-memory locking so only one claim wins, even with no database behind it — faking this away would gut the thing being demoed.

## Till, Held Sales, Store Close (ADR §11, §12)

- **Till & Cash Management (§11):** Faked + Logic. In-memory till state per register; real starting/expected/discrepancy math; real $1 threshold check; sums the in-memory audit log for expected cash.
- **Held Sales (§12):** Faked + Logic. Real hold/clear behavior; resume uses the same atomic-claim logic as BOPIS.
- **Store Close (§12):** Faked + Logic. Real gate check against in-memory till states; real bulk-expire of held sales.

## Remaining Domains (ADR §13)

- **Price Check:** Faked + Static (trivial either way — just a lookup, no real logic to fake).
- **Returns / Refunds:** Faked + Logic. Real sum of returned line items = refund amount; real status transition (Complete / Partially Refunded / Refunded).
- **Discount / Override Routing:** Faked + Logic. Real percentage math; real PIN/tier check against the in-memory roster.
- **Store Credit Ledger:** Faked + Logic. Real balance arithmetic against an in-memory starting balance.
- **Receiving:** Faked + Logic for the discrepancy calculation (expected vs. entered-received quantity, real subtraction). Faked + Static for the ASN itself — seeded fake data, since there's no real corporate to push one.
- **BOPIS / Fulfillment:** Faked + Logic for claim (real atomic in-memory lock). Faked + Static for the order list itself — seeded.
- **Announcements:** Faked + Static — seeded/canned.
- **Schedule:** Faked + Static — seeded/canned, no real corporate sync.

## Payment (ADR §6)

- Faked + Logic. Real checks on submitted payment info — expired card date, cart total summed from real line items — against in-memory state. No real acquirer or corporate connection.

## Foundational / Cross-Cutting (ADR §14)

- **§14.1–14.3 (corporate sync, both directions, conflict resolution):** Does Not Exist. No corporate API to connect to. Nothing faked here — the connection point simply isn't present yet.
- **§14.4 (Device/register identity):** Faked + Logic. In-memory register table, same pattern as the employee table.
- **§14.5 (Audit/financial integrity log):** Faked + Logic. Real in-memory append-only list — Till, Store Credit, and Returns above all depend on summing this for their math to work.
- **§14.6 (Payment terminal/PCI):** Faked + Logic — see Payment above.
- **§14.7 (Peripheral/hardware):** Faked + Static / not applicable. No physical peripherals in a demo.
- **§14.8 (Tax calculation):** Faked + Logic, trivial — flat rate applied to a real sum.
- **§14.9 (Multi-store data boundary):** Not applicable yet — single store assumed, no second store's data exists to conflict with.
- **§14.10 (Store-local backend failure mode):** Not applicable — nothing persistent to fail.

---

## Open

- Which pieces move to **Real** first, once the fully-faked build exists.
- Corporate API design and the incremental wiring plan, once that API exists — tracked separately, not here.

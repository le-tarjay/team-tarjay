# ADR: Store Backend System Design

**Status:** Proposed — foundational identity, attendance, payment-availability, deployment-topology, session-invalidation, local data/real-time, roles/roster, till/cash, held-sales/store-close, and all remaining domain-backend decisions made (Sections 4–13). Foundational/cross-cutting infrastructure, data-model prerequisites, and two explicitly-deferred items remain open (Sections 14–16). Regenerate rather than hand-edit as decisions continue, consistent with the associate-roles ADR's own convention.
**Repo:** Not specified by this document. Code location and repo organization (own repo, folded into `team-target`, or otherwise) are out of scope — same treatment as physical deployment shape (Section 7).
**Context:** The associate-roles-and-identity-state ADR (frontend) designed *who can do what* and *what state the app moves through*, deliberately without specifying how any of it is actually served, stored, or kept in sync. This ADR is where that gets designed — the systems, data stores, and integration points that make the frontend ADR's decisions actually run in a store.

---

## 1. Context

The frontend ADR flagged in its own Section 1.1 that "no backend" no longer holds, and pushed every backend question out to this document on purpose. Almost everything in that ADR — till state shared across registers, held sales visible storewide, override approval routing, roster lock/unlock, BOPIS order delivery — presupposes *something* running behind the app that isn't just client-side state. This ADR is that something.

It inherits two things directly from the frontend ADR rather than re-deciding them:
- The **three-axis permission model** (tier × department × function) and the **identity/session state machine** (Section 5 of the frontend ADR) — this ADR designs how those get enforced and persisted server-side, not what they are.
- **Section 15's prerequisites** and **Section 17's open questions** from that ADR — carried forward into Sections 15 and 16 below, since they were explicitly deferred *to* this conversation.

## 2. Governing Constraint: Self-Contained Store Operation

This is the one constraint that shapes every decision below, so it's stated once, up front, rather than repeated on every checklist item:

**A single retail store must be able to open, run a full business day, and close — sales, returns, till management, receiving, BOPIS pickup, everything — with zero connectivity to corporate or the internet.** Some functions will be degraded or unavailable without connectivity (see each domain's checklist item for which), but the store does not go down because the WAN link does.

This has one immediate architectural consequence worth stating explicitly now, because it affects almost every item below: **there must be something running locally, at the store, that acts as the source of truth for that store** — not a thin client talking to a cloud service. Whatever that "store-local backend" turns out to be, its existence is a premise for the rest of this document, not itself an open question. (Section 7 sets the boundary on how concretely this document describes that "something.")

### 2.1 External Connectivity Boundary

The store's local backend only ever talks to two things: the store's own local network, and corporate. **It never calls any third-party API, service, or website — not directly, not as a fallback, not even when corporate is reachable.** This isn't a resilience feature that kicks in during an outage; it's the connectivity model, period. There is no "normal mode" where the store reaches out to the wider internet and a "degraded mode" where it doesn't — the wider internet is never in scope for a store's own systems.

This resolves one concrete question directly: card payment processing is not a store→acquirer connection. It's a store→corporate connection, and corporate is the thing that talks to whatever sits beyond that (Section 6). The same boundary applies to anything else that might otherwise look like a natural third-party integration — tax-rate services, identity providers, mapping/lookup APIs — none of it is ever called directly by the store, only sourced from or routed through corporate.

### 2.2 No Workarounds for Corporate-Dependent Functions

If a function is genuinely dependent on corporate — because it needs corporate-only data, corporate-only verification, or the corporate connection itself (Section 2.1) — and corporate is unreachable, **that function simply goes down. No offline queueing, no cached fallback, no degraded approximation gets built for these cases.**

This is a deliberate scope cut, not an oversight, and it's worth stating why: it's the reason the sync/conflict-resolution concerns in Section 14 turn out to be smaller than they first looked. Only the domains that were always meant to run standalone — till, held sales, sales themselves, session/clock state (Sections 4–5, 11–13) — need real offline design. Everything that's corporate-dependent by nature (Section 6's Card tender, Section 14.9's cross-store data) gets a much simpler answer: it doesn't work right now, and that's fine.

## 3. Tech-Selection Philosophy (carried over, stated once)

Same rule as the frontend ADR's approach to identity: we name the *type* of thing needed (e.g., "an append-only audit log," "a pub/sub or long-poll mechanism for local real-time state") and not a specific vendor or product. A decision that something needs to be "eventually-consistent" or "append-only" is in scope for this ADR; whether that's a specific database product is not.

---

## 4. Decision: Identity — Corporate Gates Entry, Store Owns the Session

- **Corporate is the sole identity/credential authority.** Employee ID + PIN is verified against corporate at login time, and role/department is resolved there — never locally, never cached as a fallback. This sharpens the frontend ADR's "role is never self-selected" (§5) into something stricter: role is never self-verified locally, either.
- **Corporate reachability is a hard precondition to log in at all.** If corporate can't be reached, no one — not even a previously-seen employee — can start a new session. There is no local credential cache and no offline login grace period. This is a case of Section 2.2 in action: login is genuinely corporate-dependent, so it's allowed to just not work during an outage.
- **Once a session exists, the store's local backend owns everything about it from then on** — logged in/out, clocked in/out, on break, till linkage, override-approval eligibility — independent of whether corporate stays reachable. Corporate's role ends at the login handshake; it has no ongoing say in whether an already-established session stays valid.
- **Practical consequence:** opening a store for the day, or bringing on any employee who hasn't already logged in during the current outage, requires a working corporate connection. Once staff are in, the store can lose that connection for the rest of the day without anyone already working being interrupted.
- This resolves what were originally scoped as "local IdP" checklist items — "a local IdP that works with zero internet" was the wrong model, and is replaced by this decision. What was still open here — the local mechanism for forcing out an already-active session (Employee Lock's force-out tier, frontend ADR §14/§17) — is fully resolved in Section 8.

## 5. Decision: Time & Attendance is Store-Owned

- Clock-in/out and break timestamps are created, held, and treated as authoritative by the store's local backend — not validated against or sourced from corporate in real time.
- These records sync up to corporate afterward (e.g., for payroll), as one of the up-direction sync payloads (Section 14.2).
- This is a deliberate departure from the pattern used for catalog, roster, and store-credit balance (all corporate-authoritative, Section 14.9) — attendance is the one domain where the store, not corporate, is the source of truth, because a shift has to remain trackable through a corporate outage, and nothing about clocking in or out is corporate-dependent by nature.

## 6. Decision: Payment & Tender Availability During a Corporate Outage

- **Card** — routed entirely through corporate (Section 2.1). Unavailable whenever corporate is unreachable. No store-level fallback exists or is planned; this is a direct instance of Section 2.2.
- **Cash** — unaffected by corporate connectivity, gated only by till state exactly as already designed in the frontend ADR (§7) and Section 11.
- **Store Credit** — asymmetric availability:
  - *Issuing* new store credit (via a Returns-driven issuance, frontend ADR §10) remains available during an outage — it's a local event that syncs up once connectivity returns.
  - *Spending* an existing balance is **not** available during an outage, because the store cannot verify a balance it doesn't own — corporate is the sole authority on current balance (Section 14.9).
- **Net effect during a corporate outage:** Cash always works (till permitting); Store Credit works one direction only (in, not out); Card doesn't work at all.
- **Open thread, not yet resolved:** issuing store credit during an outage to a buyer with no existing local or corporate record mints a local-only buyer identity that has to reconcile with corporate once connectivity returns. This is a genuine gap in the reconciliation design (Section 14.3/14.9), flagged here so it isn't lost — not an answered question.

## 7. Decision: Local Deployment Topology — Deliberately Abstracted

- **Physical/hardware deployment shape is out of scope for this ADR.** Dedicated appliance vs. a register doubling as host vs. anything else is a real decision, just not one this document makes. This ADR works at the level of logical services and data domains, not physical machines — a further pull-back from Section 3's "type, not vendor" philosophy: hardware topology isn't a type this document needs to name either.
- **Wherever this document says "the store" or "the store's local backend,"** that means a location-scoped logical service — not a claim about which physical device it runs on.
- **Whether that logical backend is one unified service or several separate services is deliberately left open** — not resolved by the domain designs in Sections 10–13 either, since those stayed at the architecture/shape level rather than physical service boundaries. This can be revisited later if it becomes relevant, but isn't required to make progress.
- **Code location/repo organization is likewise out of scope.** Where this backend's code actually lives — its own repo, folded into `team-target`, or something else — is an implementation-organization question, not an architecture question this ADR answers.

## 8. Decision: Local Session-Invalidation Mechanism

- **Mechanism:** a session-version claim, checked on every request against the store's local session store. Two triggers bump the version and invalidate the prior session — a re-login by the same employee, or an Employee Lock action (frontend ADR §14). Both triggers funnel through this one mechanism, not two separate ones (frontend ADR §17).
- **Scope: store-local only.** This mechanism can only guarantee single-active-login *within a store* — a store has no visibility into other locations, consistent with Section 4 (corporate's role ends at the login handshake). Confirmed acceptable rather than something requiring enterprise-wide tracking.
- **Delivery:** idle devices discover an invalidated session via background polling rather than waiting for a failed action to surface it (frontend ADR §17), at a **moderate interval (tens of seconds)** — balancing responsiveness against network chatter across every register in the store.
- **Poll failure behavior: fails open.** If a register's own poll to check session validity fails (e.g., a local network hiccup), the session stays logged in and the register keeps retrying, rather than logging out on a transient failure. This accepts a stale session persisting slightly longer during a genuine network problem, in exchange for not creating false lockouts from ordinary local-network noise.
- This fully resolves frontend ADR §17's open questions on single-active-login and Employee Lock force-out, and closes what was checklist item 8.1 in earlier drafts of this document.

## 9. Decision: Local Data Store Shape & Real-Time Delivery

**Local Persistent Data Store**

- Two distinct storage patterns, not one: a **relational-style current-state store** for domain entities (sales, till, held sales, returns, roster cache, schedule cache, and so on), and a **separate append-only log** for audit/financial integrity — designed in full at 14.5, but the split itself is decided here.
- Whether the current-state store is physically one database or several remains open per Section 7 — deliberately deferred, since staying at the architecture/shape level (Sections 10–13) didn't require resolving it.
- **Atomic/transactional writes are a requirement of this store, not of the real-time delivery mechanism below.** BOPIS's "claim next order" (frontend §12) needs a claim operation that can only succeed once, even if two Associates tap claim at the same instant — that's a data-store guarantee, independent of how quickly other devices learn the queue changed afterward. Held Sales' resume operation (Section 12) reuses this exact same guarantee.

**Local Real-Time / Shared-State Delivery**

- **Scope, corrected from the original checklist framing:** applies to till status (Register Status screen, frontend §14), held sales (storewide list, frontend §8), the fulfillment queue (frontend §12), and announcements (frontend §13). Override approvals are **removed** from this list — they resolve synchronously at the point of PIN entry on the requesting register itself (frontend §6), so no cross-device visibility is needed for them at all.
- **Delivery mechanism:** the same polling pattern already established for session invalidation (Section 8) — a moderate interval (tens of seconds) — applied consistently across all four domains above, rather than optimizing each one separately. Consistency was chosen over chasing lower latency on any single domain.

This resolves what were checklist items 9.1 and 9.2 in the prior draft of this document.

## 10. Decision: Roles & Permissions Enforcement, Roster Replica, and Lock/Unlock

**Roles & Permissions Enforcement**

- **One shared authorization component** — a single source of truth for the tier × department × function model (frontend ADR §4), called into by every domain that needs a permission check, rather than each domain implementing its own checks inline.
- **Role/department is fixed for the session at login**, resolved once by corporate at the Section 4 handshake and held for the duration of the session — not re-checked live against the roster cache on every action. A corporate-side change to an employee's role or department takes effect only at their next login, not mid-shift.

**Employee Roster Replica + Lock/Unlock**

- The roster itself stays exactly as scoped in the frontend ADR (§14): read-only, corporate-owned, cached at the store.
- **Lock/Unlock's two tiers resolve without any new mechanism:**
  - *Force out an active session* — already fully solved by Section 8's local session-invalidation mechanism. Immediate, entirely store-local, no dependency on anything reaching corporate.
  - *Block future logins* — already fully solved by Section 4: every login checks corporate live, so once corporate has the lock, no further login succeeds. Nothing new to design here either.
- **The store's only responsibility is emitting the Lock/Unlock event** into the standard up-sync path (Section 14.2), same as any other payload. How and when that reaches corporate, or how quickly corporate acts on it, is outside this ADR's scope (Section 2.1) — this document stays focused on the store, not on corporate's ingestion behavior.

This resolves what were checklist items 11.1 and 11.2 in the prior draft of this document.

## 11. Decision: Till & Cash Management Backend

- **Till lives on the register**, one per register, persists across shift handoffs (frontend ADR §7) — depends on register identity (14.4, still open) for the register-ID relationship, though that dependency doesn't block this design.
- **Open:** any clocked-in Cashier-department Associate or Manager (checked via Section 10's shared authorization component) opens a till with a single starting cash figure, written via the atomic-write guarantee already established for the local data store (Section 9).
- **Close — expected cash is derived from the audit log, not a running counter.** At close-time, expected cash is computed by summing the relevant entries in the append-only audit log (Section 14.5), rather than being maintained as a separate running total on the till record. This keeps the audit log as the single source of truth and avoids a till-record aggregate silently drifting out of sync with it.
- **Discrepancy = entered − expected.** Over $1 (frontend §7), a Manager-tier PIN is required — a binary approval (yes/no), not a percentage ceiling like Discount (frontend §4.3/§4.5) — checked via Section 10's shared authorization component: any Manager-tier employee in the Cashier department, or a Store Manager (storewide scope, frontend §6), currently clocked in and not on break.
- **Store-credit split-tender nuance (frontend §4.6):** when a sale is paid partly by store credit and partly by cash, only the cash remainder counts toward the till's cash-sales figure — the audit log entries this calculation sums over need to record that split correctly, not the sale's full total.
- **Each open→close cycle is its own historical record** — a till "period" — rather than a single mutable row overwritten on the next open. Preserved after close for later reporting.
- **Fully store-local, unaffected by a corporate outage** (Section 2.2) — till was already named as one of the domains meant to run standalone.

This resolves what was checklist item 12.1 in the prior draft of this document.

## 12. Decision: Held Sales & Store Close

**Held Sales**

- A shared, storewide table in the current-state store (Section 9) — one of the four domains using the polling-based real-time delivery (Section 9), so every register sees the current list live. Each record: who held it, when, item count, total, and the parked cart contents.
- **Hold** is a single atomic write (Section 9): parks the active cart into a new held-sale record, clears the register's cart.
- **Resume uses the same atomic-claim pattern already decided for BOPIS (Section 9).** If two registers attempt to resume the same held sale at the same instant, only one succeeds — the same "only one actor can win" guarantee, applied consistently rather than inventing a separate mechanism per domain.

**Store Close**

- Store Manager only (Section 10's shared authorization component, storewide tier).
- Gates on querying every till (Section 11) for an open period — since till periods are historical records, "is any till open" means checking whether an open, not-yet-closed till period exists for any Cashier register.
- Once clear: a single atomic transaction (Section 9) — bulk-expire every held sale, and write a record of the close event itself (who, when, which tills were confirmed closed). That close record lives in the current-state store, not the financial audit log (Section 14.5) — no money moved when a held sale expires.
- **"Store Closed" is a one-time event, not a persistent gating state.** It expires held sales and records the checkpoint, then has no further effect on any other domain — consistent with the frontend ADR's own choice not to force clock-outs (§8). Nothing in this document currently needs a "store closed" flag elsewhere; one can be added deliberately later if a real need shows up, rather than built speculatively now.

This resolves what were checklist items 13.1 and 13.2 in the prior draft of this document.

## 13. Decision: Remaining Domain Backends

**Price Check** — confirmed, no new backend surface. Rides the existing product-lookup query path already used elsewhere.

**Returns / Refunds** — a Return record linked to the originating Sale: returned line items, refund amount, refund method (original tender or store credit), and the resulting Sale status (Complete / Partially Refunded / Refunded). No-receipt returns route through the shared authorization component (Section 10) for PIN-gating. Refund events write to the audit log (Section 14.5); store-credit issuance creates a ledger entry (below); cash refunds affect the till's cash-refunds figure (Section 11).

**Discount / Override Routing** — one override-request/approval flow: a Manager-tier PIN checked via the shared authorization component (Section 10), which also enforces the ceiling (20% cap for Department Manager, uncapped for Store Manager) against the approver's actual tier. This is the generalized version of the same binary/ceiling-check shape Till's discrepancy check (Section 11) and No-Receipt Return above already reuse.

**Store Credit Ledger** — a buyer-linked ledger entity, with balance derived from summing its own append-only issue/spend events — the same pattern as Till's expected-cash calculation (Section 11), not a separately maintained counter. Outage behavior is already decided (Section 6); the multi-store portability question (whether a buyer's balance is visible/spendable at a different store) remains open (14.9).

**Receiving** — three entities: an ASN (Advance Shipment Notice) pushed down from corporate (Section 14.1), a Discrepancy Log recording what didn't match, and a Stocking Task queue with department assignment, reusing the same claim-safe queue shape as BOPIS's fulfillment queue below.

**BOPIS / Fulfillment** — an Order entity, distinct from Sale (data model prerequisite, Section 15.4), with a state machine (received → claimed → picked → ready → completed) and the atomic "claim next order" guarantee already decided (Section 9). The adjustment flow, when items are unavailable at pickup, ties into Returns above.

**Announcements** — an Announcement entity (author, timestamp, targeting, text), authoring restricted to Store Manager tier via the shared authorization component (Section 10), delivered through the same real-time polling mechanism (Section 9). Store-local only — no corporate sync.

**Schedule** — a read-only replica of the corporate-authored schedule, synced down (Section 14.1). The store only displays whatever was last synced; there's no write path back.

This resolves all eight items from the domain-backends checklist in the prior draft of this document.

---

## 14. Checklist — Foundational / Cross-Cutting (Remaining)

Items from the original foundational checklist that are now decided have moved into Sections 4–13 above and are removed from this list. What's below is what's still open.

- [ ] **14.1 Corporate sync engine — down direction.** What corporate pushes/store pulls when connected: product catalog, employee roster, tax rates, schedules, ASN/shipment data, BOPIS orders.
- [ ] **14.2 Corporate sync engine — up direction.** What the store pushes when connected: completed sales, till closes, discrepancy logs, BOPIS order status, override/audit log, attendance records (Section 5), and Lock/Unlock events (Section 10) — all treated as ordinary up-sync payloads, no special-cased timing.
- [ ] **14.3 Sync conflict resolution & outage queuing.** What happens to both directions above during an outage, and how conflicts resolve when connectivity returns — including the new-buyer-during-outage-credit-issuance gap surfaced in Section 6.
- [ ] **14.4 Device/register identity.** Registers need to be durable, identifiable objects (frontend ADR §15 prerequisite) — provisioning, and how a register remembers its last-logged-in employee across logout (frontend ADR §5.1's Clock Out accountability rule depends on this). Till & Cash Management (Section 11) depends on this for its register-ID relationship.
- [ ] **14.5 Audit / financial integrity log.** The append-only log referenced in Section 9's data-store shape decision — a record of every money-touching action (sales, refunds, discounts, void, till open/close, store credit issue/spend, override approvals), independent of whatever current-state tables the domain decisions in Sections 10–13 use. Till & Cash Management (Section 11) derives its expected-cash calculation from this log directly. Store Close's own close-event record (Section 12) lives in the current-state store instead, since no money moves when a held sale expires.
- [ ] **14.6 Payment terminal integration & PCI scope.** Routing is decided (Section 6) — card goes through corporate, unavailable during an outage. Still open: the terminal-level integration itself, and where the PCI boundary actually sits (e.g., whether store systems ever see raw card data, or whether the terminal tokenizes before anything touches store infrastructure).
- [ ] **14.7 Peripheral/hardware integration layer.** Receipt printer, cash drawer, card terminal, and whatever else a register needs to drive, as a category of local device I/O.
- [ ] **14.8 Tax calculation.** Confirmed local-only computation (Section 2.1 — no live external tax service, ever) — where the rate table lives and how it's kept current without a network dependency at calculation time.
- [ ] **14.9 Multi-store data boundary.** Store credit is decided (Section 6) — corporate-authoritative, spend requires connectivity, issuance doesn't. Still open: the same question for buyer identity and loyalty tier generally, plus the new-buyer reconciliation gap Section 6 surfaced.
- [ ] **14.10 Store-local backend failure mode.** If the one thing Section 2 requires to exist locally goes down, what happens to the store? Worth an explicit answer rather than an implicit "it doesn't."

## 15. Checklist — Data Model Prerequisites (inherited from frontend ADR §15)

These were already identified as blockers in the frontend ADR. They're backend/data-model work, so they land here rather than getting re-discovered:

- [ ] **15.1** Products need a department field.
- [ ] **15.2** Registers need to exist as identifiable objects (see 14.4).
- [ ] **15.3** Registers need to remember their last-logged-in employee, even briefly after logout (see 14.4).
- [ ] **15.4** Online orders need to exist as a data object distinct from Sale (see Section 13, BOPIS/Fulfillment).

## 16. Inherited Open Questions (frontend ADR §17) This ADR Owns

The frontend ADR deliberately parked four items *for this conversation* (§17). Two are now fully resolved and removed from this list: single-active-login enforcement and Employee Lock force-out, by Section 8's session-invalidation mechanism; and the store infrastructure/identity-service question, by Sections 4 and 8 together. What's left:

- [ ] **16.1** BOPIS corporate-network side — explicitly out of scope for *this* ADR per frontend §1.1; tracked here only so it isn't forgotten, not to be designed in this document.
- [ ] **16.2** Curbside "customer has arrived" signal, and substitution during picking — both blocked on a customer-facing app that doesn't exist yet. Nothing to design until that premise changes.

## 17. New Tensions / Follow-ups Surfaced

Three of the four tensions originally raised here — card payment vs. self-contained operation, offline employee login, and store credit across an outage — have been resolved and folded into Sections 4–6. The fourth, a store-local backend being a new single point of failure, remains open and is tracked at 14.10 rather than duplicated here. Kept for structural consistency; will populate again as new tensions are found.

## 18. Explicitly Out of Scope (for now)

- BOPIS corporate-network side (16.1).
- Curbside arrival signal and substitution (16.2).
- Reporting / analytics beyond what each domain's own data model naturally supports — not requested yet, not designing for it speculatively.
- Anything on the corporate side that isn't the "other end" of this store's sync engine (14.1/14.2) — corporate's own architecture is out of scope; only its contract with the store matters here. This includes corporate's ingestion timing for any up-sync payload, e.g. Lock/Unlock events (Section 10).
- Physical/hardware deployment shape, and code location/repo organization (Section 7) — real decisions, deliberately not this document's to make.
- A persistent "Store Closed" gating state (Section 12) — nothing currently needs it; not built speculatively.

## 19. Proposed Working Order

Not committed — a suggested order for what's left, now that every domain (Sections 10–13) is decided at the architecture level:

1. 14.4 (device/register identity) — small, and referenced by several other items (14.5's audit log, Till in Section 11, the data-model prerequisites in Section 15)
2. 14.1–14.3 (corporate sync engine, both directions, plus conflict resolution) — easier to scope concretely now that every domain's data needs are known
3. 14.5–14.10 (audit log, payment terminal/PCI, hardware, tax, multi-store, failure mode) — cross-cutting, can slot in whenever
4. Section 15's four data-model prerequisites — small fixes, not real design work, can be knocked out anytime
5. Section 16's two items stay explicitly out of scope per their own notes — nothing to schedule

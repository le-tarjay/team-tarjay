# ADR: Associate Roles, Permissions, and Identity State

**Status:** Proposed
**Repo:** team-target (renamed from point-of-sale-ui — see Section 2)
**Context:** This repo was originally scoped as "the checkout terminal for Le Targét guests" — sale, payment, receipt, nothing else. This ADR documents the model behind expanding it into a full associate app: who can do what, how identity and shift state work, where the boundaries deliberately stop, and what's blocking implementation.

Renumber this to fit the existing ADR sequence in the repo. This is a snapshot as of the conversation that produced it — regenerate rather than hand-edit as decisions continue.

---

## 1. Context

A checkout-only scope doesn't need roles — there's one kind of user. A full associate app does, because most of what makes a retail app complicated isn't *what screens exist*, it's *who is allowed to do what, where, and under what conditions*. This ADR exists to write that down once, since it was arrived at incrementally and touches almost every other design decision in the app.

### 1.1 A note on backend scope

The original "no backend" framing — this repo's own description was "Angular, no backend, all the opinions" — no longer holds. A real backend is planned. Timing and design are deliberately deferred: the identity service and API shape (Section 17), and whether either integrates with `inventory-reconciliation`'s existing identity/JWT approach, are open questions on purpose, not oversights.

This is a premise correction, not a new feature decision, and it changes nothing about work already done. Every prerequisite and dependency listed in Section 15 still has to be addressed against the mock implementation as it exists today — a planned backend doesn't retroactively satisfy any of them.

BOPIS (Section 12) is where this project's backend ambitions will concentrate — both store-level and corporate-network-level. This ADR only covers the retail-store side; corporate/online is a deliberately separate, larger conversation, tracked in Section 17.

---

## 2. Decision: Naming

The app — both the repo and the in-app displayed name — is **Team Targét**.

The prior name, `point-of-sale-ui` (displayed in-app as "Le Targét POS"), stopped being accurate once the app grew past checkout into roles, receiving, scheduling, and announcements. Keeping "POS" in the name was the same overpromise/underpromise problem flagged in Section 3's "Manage Products" naming — the label describes a narrower thing than what's actually there.

- **Repo slug:** `team-target`. GitHub repo names don't handle the accented "é" or a space cleanly, and the org's existing repos (`point-of-sale-ui`, `inventory-reconciliation`) are lowercase kebab-case with no special characters — this stays consistent with that convention.
- **In-app displayed name:** `Team Targét`, accent included, since this is UI text rather than a URL/slug.

### 2.1 Names considered and rejected

- **"Store management app"** (working description, not a real candidate) — rejected as a category label, not a name, and specifically because most daily users are Associates, not managers; "management" in the name misrepresents who the app is actually for.
- **Pip, Aim** — too vague standing alone; single abstract words that don't say enough about what the app is.
- **On Target, Sightline, Take Aim, Dead Center, Pip's Floor** — right tone (brand personality, aim/precision motif) but too abstract; all require decoding a metaphor before they mean anything.
- **Targét Retail** — restates the company name rather than naming the app; doesn't disambiguate this from anything else Le Targét makes.
- **Crew App, Associate Hub, Targét Crew** — plainly literal, correctly not abstract; passed over in favor of Team Targét, not rejected for a specific flaw.

### 2.2 Follow-up actions from this decision

- Rename the repo directory/remote to `team-target`.
- Update the login screen header text from "Le Targét POS" to "Team Targét" in the next round of mockups.
- This ADR's header `Repo:` line is already updated above.

---

## 3. Current State Assessment

Baseline findings from the actual mockups (`Target_POS_Design_Mockups.zip`), reviewed before any of the decisions below were made. This is what exists today, not aspirational — it's the evidence the rest of this document argues from.

- **Login** — Employee ID + PIN. No role or department differentiation surfaced anywhere post-login.
- **Sale builder** — two layout variants (list-style "1a", card-grid "1b"), cart with quantity steppers and line removal. No discount, coupon, or price-override entry point of any kind.
- **Payment** — cash/card toggle, numeric keypad, tendered/change due. Tax is a flat hardcoded rate.
- **Receipt** — confirmation number, tender, total, change. "Start new sale" is the only exit.
- **Products** — a read-only catalog table (SKU, name, price) with search. No add/edit/create controls, despite the nav label implying management. This is a lookup screen wearing a management screen's name.
- **Sales** — history table with a status column that already includes "REFUNDED" in the mock data, but there is no visible action anywhere in the app that actually creates a refund. The data model assumes a workflow the UI doesn't have.
- **Buyers** — customer directory with loyalty tier, total spent, last visit. No visible "add buyer" or enrollment action.
- **Nav** — one static bar (Sale / Products / Sales / Buyers), identical for every signed-in user regardless of who they are. Header shows only a name, no role or department. No till/register session between login and building a sale. No hold/suspend sale. No concept of being clocked in vs. merely logged in.

Every decision below is either closing one of these gaps or explaining why a gap is being left open for now.

---

## 4. Decision: Roles

| Role | Authority | Scope | Extra function |
|---|---|---|---|
| **Associate** | Build sale, process payment, returns *with* receipt, product lookup | Own department | Executes stocking tasks assigned to them (if department has any) |
| **Department Manager** | Everything above, plus: void, no-receipt return (no fixed ceiling — PIN gate only), discount/override approval (up to 20% of sale) | Own department | Owns their department's stocking queue — sees, assigns, tracks completion |
| **Store Manager** | Everything above, no caps | Storewide, all departments | Employee account admin; authors/edits/deletes announcements |
| **Receiving Associate** | Counts shipments against expected ASN, logs discrepancies, queues stock by department | Storewide (receiving is not department-bound) | Distinct role, not a capability flag on Associate |

### 4.1 Cashier is a department, not a special case

Front-end/checkout is modeled as a department like Grocery or Electronics, with its own Associate and Department Manager. This removes the need for a separate "Team Lead" tier — a front-end supervisor is just a Cashier Department Manager.

**Consequence:** departments are not actually symmetric. Cashier has no merchandise and never receives a shipment, so its stocking queue is always empty. **We deliberately did not formalize a "service department" vs. "merchandise department" type for this.** Every department gets the same shape; Cashier's queue is just permanently empty. An empty state is cheaper than a type system and behaves identically.

Customer Support (Section 12) follows this exact same pattern, with the queue situation inverted — always full instead of always empty.

### 4.2 Permission model has three axes, not one

- **Tier** — what you're allowed to approve (Associate → Department Manager → Store Manager)
- **Department scope** — what part of the store you're bounded to
- **Function** — what job you actually do (Sales-floor vs. Receiving), which is orthogonal to tier

A Department Manager and a Receiving Associate can both report to the same department while doing entirely different jobs. Role is not a single number.

### 4.3 Override ceilings, resolved magnitudes

- **No-receipt return** — no fixed dollar ceiling for Department Manager. A valid Manager-tier PIN is the only gate. This makes Department Manager and Store Manager identical in authority for this one specific action — tier still matters everywhere else (discount ceiling, department scope), just not here.
- **Discount / price override** — percentage-based, not flat dollar. Department Manager capped at **20% of the sale**. Store Manager uncapped.
- **Void** — binary authority (can or cannot), no magnitude to cap.

### 4.4 Sale/Payment is storewide; tender availability is not

Despite the Scope column above, building a sale and taking payment is **not** confined to an Associate's own department. Any clocked-in Associate, in any department, can build a sale and accept payment on their own device — "own department" in the table describes stocking-task execution and department-scoped override eligibility, not sale-building itself.

What *is* restricted is the tender:

- **Card** — available everywhere, on any device, in any department. No till required.
- **Cash** — available only at a Cashier-department register with an open till (Section 7). Every other department, and an unopened Cashier register, behaves the same way: card only.

### 4.5 Discount

- **No self-service discount authority for Associates, at any amount.** Every discount, however small, requires a Manager PIN (Section 6) — the same override mechanism as a void or a no-receipt return. A small self-service threshold was considered and rejected.
- **Whole-sale only.** Applied to the cart total, not per line item. A separate per-item price-override capability was considered and rejected in favor of a single entry point.
- **"Coupon codes" turned out not to be real.** No validated promotions or codes exist anywhere in this app, and none are being added. This is a manual discount an approving manager authorizes, nothing more — the original "coupon codes" framing has been dropped as a mislabel, the same overpromise problem "Manage Products" had.
- **Mechanic:** Associate taps "Apply Discount" near the cart total → the override modal (Section 6) fires immediately, since Associates have no authority of their own → Manager enters PIN and a percentage → the PIN's tier enforces the ceiling directly (a Department Manager PIN cannot authorize more than 20%, Section 4.3 — exceeding it requires a Store Manager instead, no appeal or escalation flow).
- Applied discount reduces the subtotal before tax, shown as its own line ("Discount (15%): –$3.30") between subtotal and tax.
- Only one discount can be active on a sale at a time — applying a new one replaces whatever was there, not stacked.
- No reason is captured, unlike Returns (Section 10) — this stays lighter by deliberate choice.

### 4.6 Store Credit tender

Resolves the previously-flagged Payment gap (Cash/Card only).

- **Selecting Store Credit at Payment triggers a Buyer search** — the same lookup already used in Returns (Section 10), not a new mechanism. Store credit only ever gets issued through Returns — either chosen explicitly in the with-receipt path, or automatically in the without-receipt path — both of which already require identifying a Buyer at issuance time. BOPIS adjustment refunds (Section 12) always go to original tender and never issue store credit, so they don't factor in here. By the time someone wants to spend a balance, the Buyer record and balance already exist — nothing is ever orphaned.
- **If the balance is less than the sale total, split tender applies — but only as a store-credit fallback, not general split tender.** Store credit covers what it can; the associate then selects exactly one additional tender (Cash or Card) for the remainder. Any other combination (e.g., splitting Cash and Card with no store credit involved) is out of scope — this stays a narrow fallback, not a general capability.
- **Till accounting consequence:** if the remainder is paid in cash, only that remainder — not the full sale total — counts toward the till's cash-sales figure used in Section 7's expected-cash calculation.

---

## 5. Decision: Identity & Session State Machine

Login and "on duty" are two separate state machines. Conflating them was the main trap to avoid here.

```
Logged out
   │  (Employee ID + PIN — role/department looked up server-side, never chosen client-side)
   ▼
Guest ────────────────────────────────┐
 (logged in, not clocked in)          │
 - Clock In (primary CTA)             │  Clock Out
 - My schedule (own shifts only)      │
 - Announcement feed (read)           │
   │  Clock In                        │
   ▼                                  │
Full role-based nav ──────────────────┘
 (generated from tier × department      ▲
  × function)                           │ End Break
   │                                    │
   │  Start Break                      │
   ▼                                    │
On Break ───────────────────────────────┘
 - End Break (primary CTA)
 - My schedule (own shifts only)
 - Announcement feed (read)

Logout is reachable from Guest, Full role-based nav, or On Break — always returns to Logged out.
```

Key points:

- **Role is never self-selected.** Employee ID + PIN resolves to a role/department server-side (or in the mock data layer). There is no role picker at login — an app where privilege is a dropdown the user picks is the anti-pattern this explicitly avoids.
- **Clock In / Clock Out is independent of Login/Logout.** Logging out doesn't end a shift; clocking out doesn't log you out of the device. Two different actions, two different pieces of state.
- **"On duty" means an active clock-in record and not currently on break.** Not derived from the schedule. Being scheduled to work today is informational only — people call out, come in late, leave early — and must never be used as a proxy for "is currently on duty." The override-approval check and the guest/full-nav gate both read the *same* clock-in-and-not-on-break fact; they are one mechanism observed from two places, not two mechanisms that happen to agree.
- **Clock-in gates sale-building, not just override eligibility.** Because "Sale" only exists in the full role-based nav, and the full nav only renders after Clock In (and is suspended while On Break), nobody can build a sale while in Guest state or on a break. This is a direct consequence of the diagram above, but it's stated here explicitly so it isn't left as an inference: an Associate who hasn't clocked in, or who is currently on break, cannot process a transaction, full stop.
- **On Break is a sub-state of being clocked in, not a sibling to Guest.** Start Break / End Break live in the same universal nav slot as Clock Out — shift-level actions, not department-specific ones. Ending a break returns straight to the full nav; it does not route back through Guest, because the shift itself never ended.
- **Nav is generated from identity**, not static. Shared items (e.g. anything every role has) keep the same position regardless of who's signed in — nav should never reorder based on identity, only add/remove sections. Header shows name + department + role (e.g. "Avery Brooks · Grocery · Associate") so the *why* behind what's visible is never a mystery to the user.

### 5.1 Clock Out can be blocked by till accountability

A till persisting across shift handoffs (Section 7) only works if a handoff actually happens — someone has to log in before the outgoing employee can leave. This ties Clock Out to register *login* state, not to clock-in state:

- **Register logout is never restricted.** Walking away from a register mid-shift is always allowed, regardless of till state.
- **Clock Out is blocked if:** the employee was the last person logged into a register, nobody has logged into that register since, and its till is still open. This is the abandonment case — an open drawer with no one currently accountable for it.
- **Escape hatch:** the blocked employee can always log back into that register and close the till themselves — no manager override is needed to get unstuck.
- This does not change Section 7's "persists across handoffs" behavior — it just guarantees a handoff actually occurs (someone logs in) before the outgoing employee can end their shift.

---

## 6. Decision: Override / Approval Routing

When an Associate hits something requiring elevated authority (void, no-receipt return, discount past their ceiling):

- The requesting register shows a modal asking for a Manager-tier PIN.
- Valid approver = **any employee with Manager tier in that same department, with an active clock-in record who is not currently on break** (Section 5).
- No single designated "manager on duty" — first available valid PIN wins. No cross-department routing.
- The approving manager does **not** need to be logged into that register, or any register. The PIN entry itself, checked against role + department + clock/break state, is the whole mechanism.
- Because Store Manager's scope is storewide, they remain a valid approver for every department even if a single department's own Manager is on break or off the clock. This isn't a special-cased fallback — it falls directly out of Store Manager's scope as already defined in Section 4.

---

## 7. Decision: Till & Cash Management

Building a sale and taking payment is not confined to a single department (Section 4.4). Till is specifically about **cash**, and cash is Cashier-department-only.

- **Till lives on the register, not the employee.** It persists across shift handoffs — one cashier can clock out and another can clock in at the same register without the till closing.
- **An open till unlocks Cash as a tender option at that register — it does not gate sale-building.** Every department, including an unopened Cashier register, can already take Card with no till involved (Section 4.4). A closed till simply means that register behaves like every other department until someone opens it.
- **Open:** any clocked-in Cashier-department Associate or Manager can open a till with a single starting cash figure.
- **Close:** enter a single ending cash figure. Expected = starting figure + cash sales − cash refunds. Over/short is the difference.
- **Any discrepancy over $1 requires a Department Manager PIN** to close — reuses the existing override modal (Section 6) rather than a new mechanism. This is a tight threshold by design: in practice most till closes will need a Manager PIN, not just outlier ones. A direct consequence is that a Cashier register cannot close out unless a Manager is on duty at that moment.
- **Clock Out accountability:** an employee can't clock out while leaving an open till with nobody logged into that register — see Section 5.1.

---

## 8. Decision: Held Sales & Store Close

Two features bound together by a single mechanism: a held sale only expires when the store explicitly closes.

**Held Sales**

- Storewide, not register- or department-scoped. Any clocked-in Associate, in any department, can resume any held sale — consistent with sale-building already being available to everyone (Section 4.4); a hold shouldn't be more restrictive than the sale it's holding.
- Multiple concurrent holds — a real shared list, not a single toggle state.
- Each entry records who held it, when, item count, and total.
- **Hold** parks whatever's in the active cart and clears the register for a new sale. **Resume** pulls a held sale back into the active cart — only meaningful if that register's active cart is currently empty.
- No time-based expiration. The only thing that expires a held sale is Close Store.

**Close Store**

- An explicit action, not a scheduled cutoff — consistent with every other state transition in this app (Clock In/Out, Start/End Break, Till Open/Close) being deliberate rather than passive.
- **Store Manager only** can perform it. Because Store Manager is the only storewide-scoped role, this means at least one Store Manager must be on the clock at closing time for the day to end cleanly — there is no Department Manager fallback for this specific action.
- Expires every currently held sale storewide.
- **Close Store blocks until every till is closed.** This is a checklist/gate, not a cascade — the system can't fabricate a real cash count on the Store Manager's behalf, so Close Store simply cannot complete while any till remains open; the Store Manager sees which registers still need closing. Because most till closes need a Department Manager PIN (Section 7's $1 threshold), Close Store often depends on other managers acting, not just the Store Manager alone — a coordination point, not a single atomic action the way Clock Out or Start Break are.
- Does **not** force any employee clock-outs. An individual's clock-in state stays independent of the store being open or closed, consistent with Clock In/Out already being independent of Login/Logout (Section 5).

---

## 9. Decision: Price Check

Not a new permission or a new domain — a UX fast-path over capability that already exists. Any associate can already build a full sale anywhere (Section 4.4), and the Products screen (Section 3) already does price lookup by SKU or name. What Price Check adds is speed and reduced friction for the single most common floor interaction — "how much is this" — not a new thing an associate couldn't already do.

- **Own nav item**, not folded into Products or Sale Builder — a minimal-chrome, single-result-focused view (search, then a large price display), distinct from the full searchable table Products already is.
- **Reuses the existing text/SKU search** already built for Product lookup. Camera-based barcode scanning was considered and rejected as a bigger technical addition than this feature warrants.
- **Requires clock-in**, same as everything else. Guest state grants zero associate-work capability (Section 5); there's no reason Price Check should be the one exception.
- **Available to everyone, any department.** Not tier-gated, not department-gated — consistent with sale-building already being universal (Section 4.4).
- **"Add to sale" bridges into Sale Builder**, but only into an *empty* active cart — the same constraint Resume already has (Section 8). If an unrelated sale is already in progress, the associate holds it first, then adds the price-checked item into the now-clear cart. This reuses Section 8's existing rule rather than inventing a second one.
- Merely navigating to Price Check and back doesn't touch cart state at all — only the explicit "Add to sale" action interacts with it, and only under the empty-cart condition above.

---

## 10. Decision: Returns / Refund Workflow

Launched from the existing Sales screen — a per-row "Return" action on any transaction not already fully refunded, plus a standalone "Start a return" entry point for returns with no originating transaction. The two paths split on the same fact that already governs authority elsewhere in this doc: whether a receipt/confirmation exists.

**With receipt:**
1. Look up the original sale (confirmation #, customer name/phone).
2. Select item(s) and quantity to return, capped at what's still returnable — original purchased quantity minus whatever's already been returned across any prior visits. Partial returns across multiple separate visits are allowed; a transaction is not one-shot.
3. Choose refund method: **original tender**, or **store credit**. A Buyer is identified/created only if store credit is chosen — a card/cash refund needs no Buyer record.
4. Required reason (dropdown: Defective, Wrong item, Changed mind, Damaged, Item unavailable, Other). "Item unavailable" is used by the BOPIS adjustment flow (Section 12), not by in-person returns.
5. Confirm → refund confirmation screen, mirroring the existing Payment Complete screen.
6. No manager PIN — this is already Associate-tier authority.

**Without receipt:**
1. No lookup exists, since there's no originating transaction — manually enter item(s), quantity, and price being refunded.
2. Manager PIN required immediately (Section 6's override mechanism; no fixed ceiling per Section 4.3).
3. **Store credit only.** "Original tender" isn't a coherent option here — there's no original transaction to say what tender was even used. Buyer is always identified/created as part of this path, not optional.
4. Required reason dropdown (same list as above).
5. Confirm → refund confirmation screen.

**Assumption carried from Section 3:** a return is a financial transaction only — it does not adjust any stock count, because nothing in the current data model tracks on-hand quantity (the catalog has SKU/price/department, not inventory levels).

**New status needed:** allowing multi-visit partial returns means the Sales screen's status column (Section 3) needs a fourth state, **Partially Refunded**, sitting between Completed and Refunded — "not yet fully refunded" is no longer the same thing as "untouched."

**Dependency this creates — now resolved:** Payment previously supported Cash and Card only. Store credit issued through a return can now be spent — see Section 4.6.

---

## 11. Decision: Receiving Domain

New domain, separate from Sale / Product / Sales / Buyers. Corporate owns the catalog (SKUs, pricing) — no one in-store creates or edits products. What happens in-store is receiving and stocking what corporate already decided to send.

```
Shipment / ASN (expected SKUs + quantities from corporate)
        │
        ▼
Receiving session (Receiving Associate counts actual vs. expected)
        │
        ▼
Discrepancy log (short / over / damaged — three distinct states, not one "mismatch")
        │
        ▼
Stocking task (queued → assigned → in progress → done), tagged by department
        │
        ▼
Department Manager sees their queue, assigns tasks to their Associates
```

Receiving Associate is a distinct role (not a shift-flag on Associate), and is storewide rather than department-bound — one receiving session can produce stocking tasks across multiple departments.

---

## 12. Decision: BOPIS / Curbside Fulfillment

Store-side fulfillment mechanics only — order placement and customer notification happen on the online/corporate side, deliberately out of scope here (Section 1.1). This mirrors Receiving (Section 11) in shape: an external system says something needs to happen at the store, and someone has to process it — just inverted, outbound instead of inbound.

### New department: Customer Support

Modeled the same way Cashier was (Section 4.1) — no merchandise of its own. Where Cashier's stocking queue is *always empty* (Section 4.1), Customer Support's is the mirror image: it's populated entirely by BOPIS pick tasks. Same service-department shape, inverted queue situation.

Because Customer Support handles a whole order regardless of which product department its line items belong to, BOPIS does **not** depend on the still-pending "products need a department field" prerequisite (Section 15) the way Receiving does — a real point of difference between two structurally similar domains.

### Order object

An online order assigned to this store for fulfillment: order #, Buyer (always identified — an online order is never anonymous, unlike a walk-in sale), fulfillment type (BOPIS or curbside), line items, status.

**BOPIS and curbside are the same order object with a fulfillment-type flag** — not two parallel systems. Consistent with the "empty state over type system" philosophy already used for departments (Section 4.1).

### State machine

```
Queued
   │  Associate claims the next order (strict order, no browsing/cherry-picking)
   ▼
Picking (tagged to that Associate, removed from the claimable pool)
   │  All items found → mark ready
   │  Item(s) unavailable → adjust (see below)
   ▼
Ready for Pickup (shared, storewide — not tied to whoever picked it; hand-off is a separate step)
   │
   ▼
Completed
```

Self-service claim, not manager-assigned: given how many Customer Support Associates are clocked in, they take the next order off the queue themselves. This differs from Receiving's stocking queue (Section 11), which is manager-assigned — BOPIS is more time-sensitive, since a customer may already be waiting.

**Hand-off is a Customer Support responsibility, not a universal one.** Same shape as Cashier owning cash (Section 7) despite checkout being universal (Section 4.4) — any associate could technically help in a pinch, but the "Ready for Pickup" queue and the hand-off action itself belong to Customer Support specifically.

### Adjustment (item unavailable during picking)

- **Remove-and-refund only.** Substitution was considered and rejected for now — it would need the customer's approval, which runs into the same wall as curbside arrival below: there's no customer-facing app yet to ask them.
- Reuses the Returns "with receipt" path exactly (Section 10) — no Manager PIN, since it's already Associate-tier authority and there's a real order to look up.
- Returns' reason dropdown (Section 10) gains a new option: **Item unavailable**.
- Refund always goes to original tender — no store-credit choice offered, since the customer didn't choose this outcome.

### What's parked, not designed

- **Curbside "customer has arrived" signal.** Tracked in Section 17 — nothing in this app can know a customer has pulled up until the customer-facing side exists.
- **Substitution.** Tracked in Section 17 alongside curbside, for the same underlying reason.

---

## 13. Decision: Announcements

- Authored by Store Manager only.
- Can be targeted to specific department(s) or posted storewide.
- The guest-state feed for any employee shows: storewide announcements + anything targeted to their own department.
- Author can edit or delete their own posts. No cross-author moderation.

---

## 14. Decision: Store Manager Admin Tools

Two small, Store-Manager-only screens, grouped together as administrative tools distinct from the operational flows elsewhere in this doc.

### Employee Roster & Lock/Unlock

- **Employee accounts — creation, role/department assignment, PIN reset — are managed at corporate**, mocked the same way Receiving's ASN and BOPIS orders represent corporate data (Sections 11, 12). Same pattern as the product catalog (Section 11: corporate owns SKUs, the store doesn't touch them). There is no store-side creation or editing to scope, and no Department Manager version of this — corporate ownership removes the need for department-level scoping entirely.
- Team Targét's only capability here: a read-only roster (name, role, department, all pulled from corporate) with a **Lock/Unlock** toggle, Store Manager only.
- **Two tiers of what "Lock" does, not one:**
  - Blocks future logins — buildable now, an additional check against the existing Employee ID + PIN lookup (Section 5). No new dependency.
  - Forces out an already-active session — reuses the exact JWT-invalidation-and-poll mechanism sketched for single-active-login (Section 17), not a separate mechanism. This tier is parked for the same reason Section 17 is: it needs backend/realtime infrastructure that doesn't exist yet.

### Register Status

- Scoped to **Cashier registers only, not every device in the store.** Section 5.1's Clock Out block only ever triggers when "its till is still open," and only Cashier registers ever have a till (Section 7) — that condition can never be true anywhere else. A general device dashboard isn't needed.
- Per register: till status (open/closed, since when), current or last logged-in employee.
- Depends on Section 15's still-open prerequisite ("Registers aren't modeled as identifiable objects yet") — this screen is the UI surface for that data, not a resolution of the prerequisite itself.

---

## 15. Prerequisites / Blockers

Things the model above depends on that do not exist yet. These block implementation of specific pieces — not the app as a whole.

- **Products have no department field.** The current catalog (Section 3) is SKU, name, price only. Receiving, stocking-by-department, and department-scoped override routing all presuppose that every product carries a department. This has to be added to the data model before any of Sections 4, 6, or 11 can be built against real (mock) data, not just designed on paper.
- **Registers aren't modeled as identifiable objects yet.** Till state (Section 7) presupposes a Register concept with its own identity — something this app has only ever referred to informally ("the requesting register") up to now. This needs to exist before Till can be built against real (mock) data.
- **Registers need to remember their last logged-in employee, even briefly after logout.** The Clock Out accountability rule (Section 5.1) requires checking whether anyone has logged into a register since a given employee left it — this fact didn't need to exist anywhere else in the app, but it does now.
- **Online orders aren't modeled as a data object yet.** BOPIS (Section 12) presupposes an Order distinct from Sale (walk-in/register transactions), with its own status lifecycle. This needs to exist before BOPIS can be built against real (mock) data.

---

## 16. Explicitly Out of Scope (for now)

Nothing is currently tracked here — the previous entry (BOPIS/curbside pickup) has been resolved (Section 12). Kept for structural consistency; will populate again as new gaps are identified, including the corporate-network side of BOPIS once that conversation happens (Section 1.1).

---

## 17. Open Questions — Deferred, Not Decided

Raised during design, never resolved. Listed separately from Section 16 because these are gaps in a decision, not gaps in scope — someone still owes an answer.

- **Single-active-login enforcement across devices, and Employee Lock's force-out tier (Section 14).** An employee shouldn't be logged in on two devices at once, and a locked employee's active session should end immediately — both need the same mechanism. Mechanism sketch, not a full design — a sharper starting point for the future identity-service conversation (Section 1.1), not resolved here:
  - Re-login (or an admin lock) invalidates the prior session via a session-version claim checked on every request (JWT invalidation) — this is the single source of truth, not one of two separate mechanisms, and it serves both triggers.
  - Idle devices discover the invalidation via background polling rather than waiting for a failed action — the poll is the delivery method for the same invalidation fact, not a second mechanism running alongside it.
  - Two things this still needs before it's a real design: the polling interval is a genuine trade-off (faster kick-out vs. constant network chatter from every register), and what happens when a poll itself fails — fail closed (log out; a network blip then looks identical to a real security event) or fail open (stay logged in, retry; avoids false lockouts but lets a stale session survive longer during a network problem).
  - Deliberately parked until frontend feature work is finished; real backend/realtime infrastructure is needed regardless of these specifics — cannot be built as mock data alone.
- **Store infrastructure — identity service and API design.** What the planned backend (Section 1.1) actually looks like, and whether it integrates with `inventory-reconciliation`'s existing identity/JWT approach or is built independently. Deliberately deferred for the same reason as above — treated as its own foundational topic once frontend work is further along, not a side-decision of any single feature.
- **BOPIS corporate-network-level backend.** The user intends to focus heavily here — this ADR only covers the retail-store side (Section 12). Corporate/online order placement, customer notification, and the eventual integration between store and corporate systems are a deliberately separate, larger conversation for later.
- **Curbside "customer has arrived" signal.** No customer-facing app exists yet to originate this signal. Parked alongside the backend/identity questions above, for the same underlying reason.
- **Substitution during BOPIS picking.** Needs customer approval, which has the same dependency as curbside arrival above.

---

## 18. Alternatives Considered

- **Proxy "on duty"** (any employee with Manager role in a department, no time tracking) — rejected. Simpler, but stops meaning "on duty" and starts meaning "assigned to," which diverges from reality (a manager on vacation would still count).
- **Single "manager on duty" routing** — rejected in favor of "any on-duty manager in department." Simpler to reason about, matches how most stores actually operate day to day.
- **Formal service vs. merchandise department type** — rejected in favor of empty states (Section 4.1).
- **Login-time role selection** — rejected outright; role must be looked up, never chosen.
- **A fourth, read-only auditor/LP role** — considered briefly (full transaction/void/refund visibility, no edit rights). Not adopted; only worth building if an audit-trail screen is actually wanted as a deliverable.
- **Register- or department-scoped held-sale visibility** — rejected in favor of fully storewide, consistent with sale-building already being available to every associate regardless of department (Section 4.4).
- **Scheduled/time-based store-close cutoff** — rejected in favor of an explicit Store Manager action, consistent with every other state transition in this app being deliberate rather than passive.
- **Till must close on every clock-out** (a full reversal of shift-handoff persistence) — rejected in favor of the narrower accountability rule in Section 5.1: Clock Out is blocked only if leaving would abandon an open till with nobody logged into that register, which preserves tills persisting across handoffs (Section 7) rather than undoing it.
- **A small self-service discount threshold for Associates** — rejected in favor of requiring a Manager PIN for every discount, no exceptions (Section 4.5).
- **Per-item discounts** — rejected in favor of whole-sale only, keeping Discount to a single entry point rather than a second one per cart line.
- **Real, validated coupon codes with a new Promotions domain** — rejected in favor of a manual discount with no code validation, avoiding a domain the size of Receiving for what turned out to be a lightweight feature.
- **Camera-based barcode scanning for Price Check** — rejected in favor of reusing the existing text/SKU search already built for Product lookup (Section 3).
- **Department-split BOPIS picking**, mirroring Receiving's department-tagged stocking tasks — rejected in favor of a single Customer Support department handling whole orders regardless of product department (Section 12).
- **Manager-assigned BOPIS picking**, mirroring Receiving's queue-assignment model — rejected in favor of self-service claim, given BOPIS's greater time-sensitivity (Section 12).
- **Substitution during BOPIS adjustment** — rejected for now in favor of remove-and-refund only; parked for the same reason curbside arrival is (Section 17).
- **General split tender** (any two tenders combinable) — rejected in favor of a narrow store-credit-only fallback, keeping Payment's tender selection simple except in the one case that specifically requires it (Section 4.6).
- **A general device/register dashboard** — rejected in favor of scoping Register Status to Cashier registers only, since till state — the only thing the Clock Out accountability rule cares about — never applies anywhere else (Section 14).
- Naming alternatives are covered in Section 2.1, not repeated here.

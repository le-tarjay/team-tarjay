# Frontend Conventions

> Architect-owned and required, not optional: a specialist dispatched into a
> surface with no conventions spec stops and reports rather than proceeding.
> What you put here is what your generated frontend code will look like.
> Effort in, quality out. Iterate it like code.

## Status

This is a real, fairly complete first pass at a concept — a frontend-only
point-of-sale UI ("Le Targét") with no backend, built deliberately to
production standards (see the project's own
[README.md](README.md): "It is a production-minded Angular application that
happens to not have a backend yet. The standards are the same either way.").
Most of the codebase is consistent and worth treating as real precedent. Two
known defects, not precedent:

- `src/app/features/payment.component/` is a dead, empty stub (`PaymentComponent`
  with no body) — almost certainly an accidental `ng generate` leftover from
  before the real `src/app/features/payment/payment.ts` existed. It isn't
  routed anywhere and shouldn't be extended; it should be deleted.
- The README describes `/docs/architecture` (ADRs) and `/docs/domain` (a
  domain glossary) as existing. Neither directory exists in the repo yet —
  treat those as aspirational, not a place to look for context today.

Where older files disagree with newer ones (see Project structure), the
newer pattern is called out as canonical below.

[Angular's official style guide](https://angular.dev/style-guide) is the
baseline for anything not covered here — this doc calls out where this
codebase already matches it, and the one place it doesn't yet (see
`protected` in Component & state patterns).

## Runtime & framework

- **Angular 20** (standalone APIs only — no `NgModule` anywhere in the app),
  **TypeScript 5.9** with `strict: true` plus `noImplicitOverride`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, and Angular's own `strictTemplates` /
  `strictInjectionParameters` / `strictInputAccessModifiers`. Don't loosen
  these in a new file to make a type error go away.
- **Zoneless** (`provideZonelessChangeDetection()` in
  [`app.config.ts`](src/app/app.config.ts) and in every test's `TestBed`).
  There is no `zone.js`. This is the single most load-bearing runtime
  decision in the app: Angular only knows to re-render when a **signal**
  read in a template changes, `ComponentRef.setInput()` is called, or a
  bound template/host listener fires. Mutating a plain field or mutating an
  object in place without going through a `signal`'s `.set()`/`.update()`
  will silently not re-render. Don't introduce `NgZone`, `zone.js`, or
  manual `ChangeDetectorRef.markForCheck()` calls as a workaround — fix the
  state to be a signal instead.
- Build/test tooling is the standard Angular CLI (`@angular/build`) with
  **Vitest** (not Karma/Jasmine) as the unit test runner, configured in
  [`angular.json`](angular.json) (`"runner": "vitest"`) and
  [`vitest.config.ts`](vitest.config.ts).
- Styling: **Bootstrap 5** utility classes in templates, imported once
  globally in [`styles.scss`](src/styles.scss), plus a per-component `.scss`
  file for anything Bootstrap doesn't cover. No Angular Material, no
  Tailwind, no CSS-in-JS.

## Project structure

```
src/app/
  core/            # singletons: services, guards, DI tokens, app-shell layout
    <feature>/       # one folder per backend-facing concern (auth, buyer, payment, product, sales)
      <feature>.service.ts   # I<Feature>Service interface + a real-service stub, in one file
    sale/            # local UI state (SaleService) + the guard that reads it — no interface/mock
    models/          # one folder per domain, one interface per file (*.model.ts)
    tokens.ts        # every InjectionToken<I...Service> in one place
    layout/app-shell/
  features/        # one folder per routed page/flow, matches app.routes.ts paths
    <feature>/<feature>.ts / .html / .scss / .spec.ts
  shared/          # presentational components reused by 2+ features — no backend/token dependencies
    <component>/<component>.ts / .html / .scss / .spec.ts
  mocks/           # Mock<Feature>Service implementations of the I<Feature>Service interfaces
```

**File naming**: Angular's own style guide (angular.dev/style-guide) dropped
type suffixes from component filenames — match that. `login.ts`, `payment.ts`,
`app-shell.ts`, `buyers.ts` are the canonical shape: filename and class both
drop `Component`. Older files (`sale-builder.component.ts`,
`data-table.component.ts`, `product-search.component.ts`,
`sale-line-item.component.ts`, `sale-summary.component.ts`) still carry the
suffix — that's the earlier convention, not the one to copy into new files.
Rename them opportunistically when you're already touching one; don't do a
drive-by rename otherwise. Services (`auth.service.ts`), guards
(`auth.guard.ts`), and models (`employee.model.ts`) **do** keep their type
suffix — only components dropped it, matching the current Angular CLI
schematics. Component selectors, and any future custom directive
selectors, use the `app` prefix already set in `angular.json`
(`"prefix": "app"`) — `app-login`, `app-sale-builder`.

The style guide also calls for one concept per file and avoiding generic
`utils.ts`/`helpers.ts`/`common.ts` files — this codebase has neither
problem today; keep it that way rather than introducing a grab-bag utility
file. Two deliberate, acknowledged exceptions to strict one-concept-per-file:
[`core/tokens.ts`](src/app/core/tokens.ts) groups every `InjectionToken` in
one place (a common, sanctioned pattern for DI tokens specifically), and the
`*.model.ts` files group several tightly-related shapes together (e.g.
`payment.model.ts` holds `TenderType`, `TenderSelection`, `PaymentRequest`,
and `PaymentReceipt` — one domain, several types). Don't read those as
license to bundle unrelated things into one file.

`core/` holds two genuinely different kinds of thing — see Component &
state patterns below for which pattern each gets.

## Component & state patterns

- **Standalone only.** Every component sets `imports: [...]` directly; there
  are no `NgModule`s to add anything to.
- **State is signals, always.** `signal()` for owned state, `computed()` for
  anything derived, `input()`/`input.required()`/`output()` for component
  I/O (not the `@Input()`/`@Output()` decorators). This isn't a style
  preference — under zoneless change detection it's what makes the
  component render at all.
- **DI via `inject()`**, not constructor parameters — every component,
  guard, and service in this codebase uses `private readonly x = inject(X)`
  at the top of the class body. This matches current Angular guidance
  (angular.dev/style-guide: "more readable... better type inference") and
  is used with zero exceptions here — don't introduce constructor injection.
- **Two distinct service shapes in `core/` — pick the right one:**
  1. **Backend-facing services** (`auth`, `buyer`, `payment`, `product`,
     `sales`): define an `I<Feature>Service` interface, a real
     `@Injectable({providedIn: 'root'})` class implementing it that
     currently just `throwError(() => new Error('Real ... is not configured
     yet.'))`, an `InjectionToken<I<Feature>Service>` for it in
     [`core/tokens.ts`](src/app/core/tokens.ts), and a `Mock<Feature>Service`
     in `mocks/` wired to the token in
     [`app.config.ts`](src/app/app.config.ts). Components inject the
     **token** (`inject(PRODUCT_SERVICE)`), never the concrete class — that's
     the seam that makes wiring up a real backend later a one-line change
     in `app.config.ts`, not a find-and-replace across features.
  2. **Local UI/domain state** (`SaleService` is the only example today):
     plain `@Injectable({providedIn: 'root'})`, signals + computed, no
     interface, no token, no mock — because there's no backend call to
     swap out, just in-memory session state. Inject the concrete class
     directly. Don't manufacture an interface/token/mock for a store that
     doesn't call anything external.
- **Data loading**: `ngOnInit` calls a private `load<Thing>()` method that
  sets `isLoading.set(true)`, calls the injected service, and
  `.subscribe({ next, error })` — see
  [`products.ts`](src/app/features/products/products.ts),
  [`buyers.ts`](src/app/features/buyers/buyers.ts),
  [`sales.ts`](src/app/features/sales/sales.ts) for the identical shape
  across all three list views. Don't use the `async` pipe for this — it's
  never used anywhere in the app; the signal-driven subscribe pattern above
  is the convention.
- **Forms**: `FormsModule` + `[ngModel]`/`(ngModelChange)` bound to signals
  (`[ngModel]="query()"` / `(ngModelChange)="query.set($event)"`) —
  **not** `ReactiveFormsModule`/`FormGroup`, which appears nowhere in this
  codebase. This is also the right call under zoneless: reactive forms'
  internal state changes don't notify Angular on their own, while a signal
  write always does.
- **Template control flow**: `@if`/`@for`/`@empty`, never `*ngIf`/`*ngFor`.
- **Class/style bindings**: use `[class.foo]="cond"` / `[style.foo]="val"`
  directly (see `data-table.component.html`'s `[class.text-center]` /
  `[class.text-end]`), not `NgClass`/`NgStyle` — neither is imported
  anywhere in this codebase; keep it that way per the style guide.
- **Event handler naming**: name handlers for the action they perform, not
  the triggering event — `login()`, `processPayment()`, `selectTender()`,
  `removeProduct()`, never `onClick()`/`handleSubmit()`. Followed with zero
  exceptions today; keep it that way.
- **Lifecycle hooks stay thin**: `implements OnInit` and delegate to a
  private, well-named method (`ngOnInit(): void { this.loadProducts(); }`
  in `products.ts`/`buyers.ts`/`sales.ts`) rather than inlining the logic in
  the hook itself. A one-line hook body (like `login.ts`'s redirect check)
  is fine as-is; anything longer gets its own method.
- **Access modifiers — a real gap to close, not a pattern to copy**: the
  style guide calls for `protected` on any signal/input/output/computed
  that's only read from the template. `app.ts`'s
  `protected readonly title = signal(...)` is the only place in the app
  that does this. Every other component (`login.ts`, `products.ts`,
  `payment.ts`, `sale-line-item.component.ts`, etc.) declares these as
  plain `readonly` — implicitly public — even though they're template-only.
  Use `protected readonly` for template-only members going forward; fix
  existing components opportunistically when you're already touching one,
  don't do a sweeping rename pass just for this.
- Anti-pattern: reaching into another feature's component or service
  directly. Cross-feature data flow goes through a `core/` service/store
  (like `SaleService`) or router params — not by importing a sibling
  feature's component.
- Anti-pattern: putting a `Mock*Service` behind anything other than the
  token it's mocking, or giving it behavior the real interface doesn't
  declare — a mock is a contract (see README: "A mock that is clean is a
  contract").

## Styling

- Bootstrap 5 utility classes (`d-flex`, `card`, `btn btn-primary`, `navbar`,
  grid/spacing utilities) directly in templates for layout and common
  widgets. Reach for a component-local `.scss` file only for what Bootstrap
  doesn't give you (see `login.scss`, `app-shell.scss` for the shape — small,
  targeted rule sets, not full re-styling of Bootstrap components).
- Every component gets its own `<name>.scss` via `styleUrl`, even if it
  starts near-empty — don't inline styles in the `@Component` decorator.
- `styles.scss` at the app root is for the Bootstrap import and true global
  resets only (see the current file — a handful of lines). Feature-specific
  rules belong in that feature's own stylesheet.

## Internal libraries & shared code

- `shared/` is for presentational components used by 2+ features with no
  dependency on a `core/` token or service — `DataTableComponent` is the
  reference example: it takes `columns`/`rows` as inputs and knows nothing
  about products, buyers, or sales. If a "shared" component needs to
  `inject()` a backend-facing token, it isn't shared — it belongs in
  `features/` next to the one feature that actually uses it (this is why
  `ProductSearchComponent`, which injects `PRODUCT_SERVICE`, lives in
  `shared/` today but arguably shouldn't — don't copy that placement for a
  new component with the same shape; put it under the feature that owns it
  unless a second feature genuinely reuses it).
- No third-party UI library beyond Bootstrap. No state-management library
  (NgRx, NgXs, Akita) — `SaleService`-style signal stores are the
  established pattern for anything bigger than component-local state; don't
  introduce one until a store needs to be shared across more features than
  today's single example.

## Error, loading & empty states

Every list-loading component (`products.ts`, `buyers.ts`, `sales.ts`) uses
the same three-signal shape: `isLoading`, `errorMessage`, and the data
signal itself, all reset at the start of the load and updated in
`subscribe({ next, error })`. Follow it for any new list view. Two related
but distinct rules for what `errorMessage` actually shows:

- **User-initiated actions** (login, processing a payment) show the
  thrown `Error.message` **directly** — those messages
  (`'Invalid employee ID or PIN.'`, `'Tendered amount must cover the sale
  total.'`) are written by the service specifically to be shown to the
  user. If you add a new service method that can fail in a
  user-actionable way, throw an `Error` with a message written for the end
  user, not a debugging message.
- **Passive on-load data fetches** (`products.ts`, `buyers.ts`, `sales.ts`)
  show a generic, feature-specific fallback (`'Products could not be
  loaded.'`) instead of the raw error — a list failing to load is more
  likely a transient/network problem the user can't act on, and the raw
  error isn't guaranteed to be user-safe the way an intentionally-thrown
  validation error is.
- **Loading state**: `DataTableComponent` renders `isLoading()` as a plain
  "Loading..." row in the table body rather than a spinner overlay — reuse
  that component for any new tabular list rather than hand-rolling loading
  markup.
- **Empty state**: `DataTableComponent`'s `@empty` block
  (`emptyMessage` input, default `'No records found.'`) is the convention
  for "loaded successfully, zero rows" — pass a feature-specific message,
  don't leave the default unless "No records found." is actually correct
  for that list.

## Test levels

**This surface runs one level: unit tests.** No integration or flow/E2E
tests live in `frontend/` — flow coverage across a full navigated journey
is the `e2e` surface's job (see `../e2e/CONVENTIONS.md`).

**What "unit test" means here:**
- **Framework**: Vitest via Angular's built-in test runner
  (`TestBed` + `ComponentFixture`, same API as the old Karma setup). Always
  include `provideZonelessChangeDetection()` in `TestBed.configureTestingModule`
  — every existing spec does, and omitting it doesn't match how the app
  actually runs.
- **Component specs**: `TestBed.configureTestingModule({ imports:
  [TheStandaloneComponent], providers: [...] }).compileComponents()`, then
  `fixture.componentRef.setInput(...)` for required inputs (see
  [`sale-line-item.component.spec.ts`](src/app/shared/sale-line-item/sale-line-item.component.spec.ts))
  and `fixture.detectChanges()` before assertions.
- **Components behind a token** (e.g. `LoginComponent` behind
  `AUTH_SERVICE`): provide the `Mock*Service` for that token in the test's
  `providers`, exactly like `app.config.ts` does for the real app — see
  [`login.spec.ts`](src/app/features/login/login.spec.ts). Don't hand-roll a
  separate test double when a `Mock*Service` already exists.

**How it's invoked:** `ng test` (or `npm test`) runs the whole suite.
`ng test --include="**/sale.service.spec.ts"` runs a single spec file. There
is only one level here, so there's no separate "run unit alone" command —
this is it.

**Gap to close, not a pattern to copy**: most specs today only assert
`expect(component).toBeTruthy()` / `expect(service).toBeTruthy()` — that's
a smoke test, not coverage. `SaleService` in particular has real,
pure logic (`addProduct`, `updateQuantity`, the `subtotal`/`tax`/`total`
computed chain) with no test beyond "should be created" — new tests
should assert actual behavior, not just construction. `buyers.ts`,
`products.ts`, `sales.ts`, and `DataTableComponent` have no spec file at
all today; new list views/shared components should ship with one.

**What this surface deliberately does not test:** no flow or multi-screen
tests here — those live in the `e2e` surface. A component spec stops at
the component boundary; it does not drive a real browser or assert on
navigation across features.

**What this surface owes the surfaces that test it:** the `e2e` suite
locates every element by role and label (`getByRole`/`getByLabel`) — never
CSS, never `data-testid`. Every interactive element must keep a real
accessible name: a genuine `<label for>` association for form controls, a
real button/link role for anything clickable. This is a hard requirement,
not an accessibility nice-to-have — breaking it doesn't fail a frontend
test, it makes an e2e spec flaky somewhere else, for a reason that traces
back to a markup change here.

## House opinions

These three are the project's own stated philosophy (see
[README.md](README.md)) and are real, followed conventions, not aspirational:

- **State is owned, not scattered.** Cart/session state (`SaleService`),
  UI-local state (component signals), and server data (the `I*Service`
  seam) are three different things — don't blur them, e.g. don't cache a
  service response in `SaleService` just because it's convenient.
- **Mocks are first-class citizens.** A `Mock*Service` is real code with the
  same type-safety and care as anything else — it implements the real
  interface, and its fake data should be plausible and internally
  consistent (see the buyer/product/sales mock data), not `TODO` placeholders.
- **Comments explain why, not what.** If a name already says what the code
  does, don't add a comment restating it. Comment only a non-obvious
  decision (see `active-sale.guard.ts`'s absence of a comment vs. a case
  where a comment would actually be needed — e.g. explaining a magic
  number like the payment component's not-yet-configurable tax rate would
  earn a comment; the guard's intent is already obvious from its name).
- Two Angular-version-specific defaults worth keeping explicit as the app
  grows: routes are all eager (`component: X`), not `loadComponent(...)` —
  fine at this size, revisit if the route list grows much further; and no
  component sets `changeDetection: ChangeDetectionStrategy.OnPush`
  explicitly — harmless under zoneless (there's no zone-driven check to
  skip), so don't add it reflexively, but do keep all template-bound state
  signal-driven, which is the thing that actually matters here.

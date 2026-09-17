# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Team Targét** ("Le Targét") is a point-of-sale application built to
showcase architecture patterns. The repository is a monorepo with four
surfaces, each with its own `CONVENTIONS.md` — read that file before writing
code in any of them:

- `frontend/` — Angular 20 SPA. Meant to be totally real, production-built —
  nothing rigged up here.
- `backend/` — ASP.NET Core Web API (.NET 10, Clean Architecture). The only
  surface that's selectively faked, and only in what logic serves a
  response — every endpoint the frontend needs actually exists; a given
  piece is either an in-memory collection doing real computation or a
  hardcoded response, decided per piece as it's built.
  No real database, ever. Auth is real (Keycloak, self-contained in local
  docker-compose), not faked.
- `infrastructure/` — CDKTF Python, targeting AWS.
- `e2e/` — Playwright flow tests, real UI end to end, no rigging.

The ADRs live in Linear, not in this repo — "ADR: Store Backend System
Design" and "ADR: Associate Roles, Permissions, and Identity State
(Frontend)". Read them for the why behind the how described here and in each
surface's `CONVENTIONS.md`. Each project also carries its own
"Reference: ADR — …" copy; the workspace-level documents are the canonical
ones.

The four surfaces share no code. Frontend/e2e call backend at runtime (real
HTTP calls, not mocks, once a given feature is wired up); backend and
infrastructure have no build dependency on frontend or e2e.

## Commands

### Frontend (`frontend/`)

```bash
npm install          # install dependencies
ng serve             # dev server at localhost:4200
ng build             # production build
ng test              # run all tests (Vitest)
ng test --include="**/sale.service.spec.ts"  # run a single spec file
```

### Backend (`backend/`)

```bash
dotnet build         # build entire solution
dotnet test          # run all tests (xUnit)
dotnet test --filter "FullyQualifiedName~ContactStore"  # run a single test class
dotnet run --project src/Tarjay.Team.Api  # run the API
```

### Infrastructure (`infrastructure/`)

```bash
poetry install        # install dependencies
poetry run pytest     # unit / construct-synth tests
poetry run ruff check .   # lint
poetry run mypy .     # typecheck
```

### E2E (`e2e/`)

```bash
npm install           # install dependencies
npm test              # run the whole suite, headless
npm run test:smoke    # @smoke-tagged subset only
npm run test:ui / test:headed / test:debug  # interactive local variants, not for CI
```

## Frontend architecture

**Zoneless Angular** — `provideZonelessChangeDetection()` is set globally. There is no `zone.js`. Angular only re-renders when a signal read in a template changes. Mutating a plain field without going through `signal.set()`/`.update()` will silently not re-render. This is the most critical runtime constraint in the frontend.

**Directory layout:**

```
src/app/
  core/       # singletons: services, DI tokens, guards, app-shell layout
  features/   # one folder per routed page, matching app.routes.ts
  shared/     # presentational components used by 2+ features, no token/service deps
  mocks/      # Mock*Service implementations of the I*Service interfaces
```

**Two distinct service shapes in `core/`:**

1. **Backend-facing** (`auth`, `buyer`, `payment`, `product`, `sales`): each has an `I<Feature>Service` interface, an `InjectionToken` in `core/tokens.ts`, and a `Mock*Service` in `mocks/`. Components inject **the token** (`inject(PRODUCT_SERVICE)`), never the concrete class. The mock is wired to the token in `app.config.ts` **only until that feature's real backend endpoints exist** — once real, `app.config.ts` swaps to the real service for good, and the mock lives on only as a test double in that feature's own spec files (see `frontend/CONVENTIONS.md`). There is no demo/offline mode that keeps a mock wired into a real running app.

   **`auth` has already made that trip.** `app.config.ts` provides the real `AuthService`, which posts to the sign-in endpoint and resolves the employee's role, department, and job function for the session. Note `useExisting`, not `useClass`: the service is `providedIn: 'root'` and holds the signed-in employee, so `useClass` would create a second instance and therefore a second, silently divergent copy of that state. `buyer`, `payment`, `product` and `sales` are still mock-wired, and their real classes still throw `'not configured yet'`.

2. **Local UI state** (`SaleService`): plain `@Injectable({providedIn: 'root'})` with signals and computed — no interface, no token, no mock. Inject the concrete class directly. Don't manufacture an interface/token for a store that does no I/O.

**Other patterns that are non-negotiable:**
- State: `signal()` / `computed()` always; `input()`/`output()` for component I/O (not `@Input()`/`@Output()` decorators)
- DI: `private readonly x = inject(X)` in the class body; never constructor injection
- Forms: `FormsModule` + `[ngModel]` bound to signals; never `ReactiveFormsModule`
- Template control flow: `@if`/`@for`; never `*ngIf`/`*ngFor`
- Standalone components only; no `NgModule`
- Event handlers named for the action (`login()`, `processPayment()`), never `onClick()`

**File naming**: New components drop the `Component` suffix (`login.ts`, `payment.ts`). Older files still carry it (`sale-builder.component.ts`) — that's the prior convention, not what to copy. Services and guards keep their type suffix.

**Access modifiers**: Use `protected readonly` for signals/inputs/outputs only read from the template. Most existing components use plain `readonly` — that's a gap to close opportunistically.

**Known dead code**: `src/app/features/payment.component/` is an empty stub from an accidental `ng generate`. It is not routed anywhere and should be deleted.

## Backend architecture

Clean Architecture with one solution (`Team-Targét-Backend.sln`) at `backend/`. Projects:

```
src/
  Tarjay.Team.Api/           # HTTP only: controllers, DI wiring, Program.cs
  Tarjay.Team.Domain/        # entities, interfaces, exceptions — zero framework references
  Tarjay.Team.Infrastructure/ # real external dependencies — today the Keycloak identity client. Not for persistence: there is no real database, ever (see backend/CONVENTIONS.md), so in-memory stores stay where they are
  Tarjay.Team.Application/   # does not exist yet — create only when a use case needs to coordinate more than one domain interface
tests/
  Tarjay.Team.Api.IntegrationTests/     # WebApplicationFactory<Program>
  Tarjay.Team.Domain.UnitTests/         # xUnit + Moq
  Tarjay.Team.Infrastructure.UnitTests/ # xUnit, stubbed at the HTTP boundary
```

**Key rules:**
- `Domain` has zero ASP.NET/EF/JSON framework references. If you're reaching for `using Microsoft.AspNetCore.*` inside `Domain`, that code belongs in `Api` or `Infrastructure`.
- Controllers stay thin: route → call one service/store method → return result. No business logic.
- DI registration: one `internal static class …ServiceCollectionExtensions` per concern in `Api/DependencyInjection/`.
- Data access consumers depend on an interface (`IContactStore`-style), never a concrete store.
- Use C# primary constructors for classes that only assign injected dependencies.
- Domain exceptions are thrown from `Domain` and mapped to status codes by an `IExceptionHandler`, never translated by hand in a controller.
- `Infrastructure` now exists — the Keycloak identity client was the first real external dependency to need it. `Application` still does not: do not create it speculatively.

**Known gaps (do not copy as patterns):**
- **Sign-in is real and works end to end**: `POST /v1/employees/sign-in` resolves an employee against Keycloak, which runs in the local docker-compose stack at `infrastructure/local/`. But `Program.cs` still has no `AddAuthentication`/`AddJwtBearer` — nothing validates a bearer token on any subsequent request, and the JWT setup in the integration-test factory is test-only scaffolding. **Do not add `[Authorize]` until that is wired.**
- `Tarjay.Team.Domain/Contact/` is disposable demo code (originally scoped for a Temporal demo that was never built). Its low-level syntax (file-scoped namespaces, XML doc comments) is real style; its `= null!` properties are the pattern to move away from.
- No backend `.editorconfig` exists — 4-space indent for `.cs` is canonical but enforced by convention only. Add one when touching the backend config.

**Code style highlights:**
- 4-space indent, Allman braces (open brace on its own line)
- `_camelCase` private instance fields; `s_camelCase` static fields
- Explicit `using` declarations (no `ImplicitUsings`), ordered: `System.*` → `Microsoft.*` → project namespaces
- `var` only when type is obvious from the RHS; `required` properties over `= null!`
- No `ConfigureAwait(false)` — suppressed globally via `Directory.Build.props`

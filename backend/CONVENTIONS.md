# Backend Conventions

> Architect-owned and required, not optional: a specialist dispatched into a
> surface with no conventions spec stops and reports rather than proceeding.
> What you put here is what your generated backend code will look like.
> Effort in, quality out. Iterate it like code.

## Status

This surface is early — the only real code today is the default ASP.NET
`WeatherForecastController` template and a `Contact` sample module. The
`Contact` module's own comments describe it as a demo for Temporal
orchestration ("import flows", "activities", idempotent upserts) — **that
framing is not real**. No Temporal package, worker, or docker-compose exists
in this repo. Treat `Tarjay.Team.Domain/Contact/*` as disposable sample code,
not precedent, until it's replaced. Its low-level *syntax* (file-scoped
namespaces, XML doc comments) does reflect the real house style below —
except its indentation and its `= null!;` properties, both called out as
gaps in Code style.

Persistence and auth are now decided, not open (see House opinions): there
is no real database, ever — every endpoint's data comes from an in-memory
collection or a hardcoded response, per the tier assigned to it in
`docs/architecture/demo-build-tiering.md`. Auth is real, not tiered like
data-serving logic — a real external identity provider (Keycloak),
self-contained in local docker-compose, gates login end-to-end, per
`docs/architecture/ADR-backend-system-design.md` §4 ("corporate is the sole
identity/credential authority").

## Runtime & framework

- **C# / .NET 10**, ASP.NET Core Web API with **Controllers** (`[ApiController]`
  + `ControllerBase`), not Minimal APIs. See
  [`WeatherForecastController.cs`](src/Tarjay.Team.Api/Controllers/WeatherForecastController.cs).
- `Nullable` is `enable`, `ImplicitUsings` is **disabled** — every file lists
  its `using`s explicitly, grouped `System.*` → `Microsoft.*` → project
  namespaces, alphabetical within each group.
- Analyzers are on (`EnableNETAnalyzers`, `AnalysisLevel=latest`,
  `EnforceCodeStyleInBuild=true`) but `TreatWarningsAsErrors` is `false` —
  fix analyzer warnings, don't suppress them, but a warning won't fail the
  build. `CA2007` (`ConfigureAwait`) is globally suppressed — this is a
  server app with no `SynchronizationContext` to deadlock on, so don't add
  `ConfigureAwait(false)` calls.
- `EnforceCodeStyleInBuild=true` is what makes `IDExxxx` code-*style* rules
  (as opposed to `CAxxxx` code-*quality* rules) run at build time instead of
  only as IDE suggestions — but there's no backend `.editorconfig` yet, so
  every `IDExxxx`/`CAxxxx` rule is running at whatever severity the SDK
  ships by default, none of it tuned to this document. `AnalysisLevel=latest`
  with no `AnalysisMode` set means the implicit mode is `Default` (a modest
  subset of rules) — bumping to `Recommended` or `All` is available later if
  stricter enforcement is wanted, but isn't set today. See Code style for
  the concrete rules a `.editorconfig` should eventually encode.
- These settings live in [`Directory.Build.props`](Directory.Build.props) at
  the backend root and apply to every project — don't override them per-project.

## Code style

Sourced from the [.NET coding conventions](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions),
the [.NET runtime C# coding style](https://github.com/dotnet/runtime/blob/main/docs/coding-guidelines/coding-style.md)
(the stricter, production-grade sibling the docs conventions are adopted
from), and the [code analysis overview](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/overview),
reconciled against what's actually in this repo:

- **Indentation is 4 spaces, no tabs.** This is a deliberate change from
  what's on disk today — every existing `.cs` file uses 2-space indent, and
  there is no backend `.editorconfig` pinning either width. 4-space is now
  canonical; don't hand-fix existing files' indentation piecemeal — reformat
  a file with `dotnet format` (or your editor's formatter) when you're
  already touching it, and prefer adding a real `.editorconfig` (see below)
  over relying on convention alone.
- **Allman braces** (opening brace on its own line) — already followed with
  zero exceptions in this repo; keep it.
- One statement and one declaration per line; no single-line `if` without
  braces — already followed (`InMemoryContactStore.cs`,
  `WeatherForecastController.cs`); keep it.
- **Naming**:
  - Private/internal instance fields: `_camelCase` — matches
    `InMemoryContactStore`'s `_byExternalId` and `_nextId` today.
  - Static fields: `s_camelCase`; thread-static: `t_camelCase` (no example
    in real code yet — `WeatherForecastController`'s unprefixed `Summaries`
    static field is template code, not the pattern to copy).
  - Public types, methods, and properties: `PascalCase`.
  - Primary constructor parameters: `camelCase`, no underscore
    (`ILogger<FooController> logger`, not `_logger`) — assign to a
    `_`-prefixed field only if the constructor body does more than trivial
    assignment.
- **Explicit visibility, modifier order**: always state `public`/`private`/
  `internal` explicitly, with the accessibility keyword first
  (`private static readonly`, not `static private readonly`) — already
  followed everywhere.
- **Seal or make static what isn't meant to be derived from**:
  `InMemoryContactStore` (`public sealed class`) and
  `ServiceCollectionExtensions` (`internal static class`) both already do
  this — keep doing it for any new internal/private type unless it's
  explicitly designed as a base class.
- **No `this.` qualifier** unless required to disambiguate — zero exceptions
  today, keep it that way.
- **`var`** only when the type is obvious from the right-hand side itself
  (a `new`, an explicit cast, or a literal) — not because a method name
  hints at it. Use the explicit type otherwise.
- Prefer `required` properties over `= null!` null-forgiving suppression for
  properties that must be set before use.
  `Tarjay.Team.Domain/Contact/Contact.cs`'s `ExternalId`, `FirstName`, etc.
  use `= null!;` today — that's the pattern to move away from, not copy,
  the next time a type like this is real.
- Prefer collection expressions (`string[] vowels = ["a", "e"];`) over
  `new[] { "a", "e" }`, and object initializers over property-by-property
  assignment, for any code targeting the current C#/`net10` version.
- **Comments**: single-line `//` only, never `/* */` blocks; on their own
  line above the code, not trailing it; start with a capital letter, end
  with a period, one space after `//`. `InMemoryContactStore.cs`'s
  `// Preserve the id assigned on first insert; update the mutable fields.`
  is the one real example in the codebase and already matches this exactly.
- `using` directive ordering (`System.*` → `Microsoft.*` → project
  namespaces, alphabetical within each group, outside the namespace
  declaration) is covered in Runtime & framework — this is the same rule,
  restated here because it's also an explicit style-guide recommendation,
  not just an observed pattern.
- **Add a backend `.editorconfig`.** None exists today (the root-level one
  belonged to the now-removed frontend/Angular tooling), so nothing above
  is actually enforced — it's convention only. A `.editorconfig` with
  `indent_size = 4` for `*.cs` plus the `dotnet_diagnostic.IDExxxx.severity`
  / `dotnet_naming_rule.*` entries for the naming rules above (the
  [dotnet/docs `.editorconfig`](https://github.com/dotnet/docs/blob/main/.editorconfig)
  is a reasonable starting point to adapt) is what would make this section
  self-enforcing instead of aspirational.

## Project structure

Clean Architecture layering, one solution folder per layer under `src/`:

```
backend/
  src/
    Tarjay.Team.Api/            # HTTP layer only: controllers, DI wiring, Program.cs
      Controllers/
      DependencyInjection/       # one ServiceCollectionExtensions per concern
      Models/                    # request/response DTOs, API-shape only
    Tarjay.Team.Application/     # use cases / orchestration (create when the first one exists)
    Tarjay.Team.Infrastructure/  # persistence, external clients (create when a real store exists)
    Tarjay.Team.Domain/          # entities, domain interfaces, domain exceptions — no framework refs
      <Feature>/                 # one folder per aggregate/feature, not per type-kind
  tests/
    Tarjay.Team.Api.IntegrationTests/    # WebApplicationFactory<Program>, hits real DI graph
    Tarjay.Team.Domain.UnitTests/        # xUnit + Moq, one *.UnitTests project per src project
```

`Application` and `Infrastructure` don't exist yet — don't create them
speculatively. Add `Tarjay.Team.Infrastructure` when the first real
persistence implementation lands; add `Tarjay.Team.Application` when the
first use case needs to coordinate more than one domain interface. Until
then, simple singleton stores registered straight from `Domain` (as
`InMemoryContactStore` does today) are fine. When `Infrastructure` does
land with disposable resources (`DbContext`, `HttpClient`, connections),
let DI own their lifetime via the standard `IDisposable`/`IAsyncDisposable`
pattern — don't manually `new` one up and hold it in a singleton.

`Domain` has zero framework package references — no ASP.NET, no EF Core, no
JSON attributes tying it to a wire format. If a domain type needs
`[JsonPropertyName]` today it's because there's no separate DTO yet; don't
treat that as the target shape once `Application`/API DTOs exist.

Within `Domain`, organize by feature/aggregate (`Contact/`, not
`Models/` + `Interfaces/` + `Exceptions/` split across the project root).

## API surface

- **Routes**: plural, kebab-case resource nouns, RESTful nesting for
  parent/child relationships (`/employees/{id}`, `/held-sales/{id}`,
  `/registers/{id}/till`). An action that doesn't fit CRUD-on-a-resource gets
  an action-suffix path on the resource it acts on (`/held-sales/{id}/resume`,
  `/tills/{id}/close`) rather than being forced into a resource+verb noun of
  its own.
- **Versioning**: URL-path versioning from day one — every route starts
  `/v1/...` — even though the frontend is the only consumer today. Deliberate:
  `docs/architecture/ADR-backend-system-design.md`'s corporate-sync concept
  (§14.1–14.3) is a second, genuinely external consumer this API will
  eventually need to support, and retrofitting versioning after that exists
  is real, avoidable pain.
- **Response envelope (success only)**: every successful response is
  `{ "data": ..., "meta": {...} }` — `data` holds the resource or list,
  `meta` holds pagination info (below) and anything else that isn't the
  resource itself (e.g. a future sync timestamp). A single-resource `GET`
  still gets the envelope even though it will never paginate — one
  consistent shape for every success response, not a special case for lists.
- **Pagination**: offset/limit (`?page=`, `?pageSize=`), with `meta` carrying
  `page`, `pageSize`, `totalCount`. Chosen knowingly over a cursor-based
  approach despite this domain having actively-mutating queues (held sales,
  BOPIS fulfillment) where offset/limit can shift or repeat items across
  pages — accepted, not an oversight.
- **Validation**: FluentValidation, one validator per request DTO, registered
  by assembly scan, run before the controller action executes. A validation
  failure returns `422` with ASP.NET Core's own `ValidationProblemDetails`
  shape — the standard framework shape, not a custom one.
- **Error responses do not use the envelope.** A `ProblemDetails` (or
  `ValidationProblemDetails`) response stands alone at the top level, exactly
  as ASP.NET Core produces it (`application/problem+json`) — never wrapped in
  `{ data, meta }`. Only success responses use the envelope; a consumer
  branches on status code to know which shape to expect, not the other way
  around.
- **Status codes**: `404` for a missing resource, `422` for a validation or
  mapped domain-rule failure (see Error handling), `500` only for the
  fallback handler's genuinely unexpected case — never for anything a
  per-aggregate exception handler can anticipate and map.

## Logging and observability

- **Levels**: `Information` for a completed request or action (login
  succeeded, till closed, sale completed). `Warning` for a recoverable
  failure — a failed PIN attempt, a validation rejection — something that
  happened but didn't break anything. `Error` only for the fallback
  exception handler's genuinely unexpected case (see Error handling) — never
  for an ordinary, anticipated domain rejection like "not found."
- **PINs and tokens never appear in a log line, at any level, including
  inside an exception's message.** Stated explicitly for this domain, not a
  generic aspiration — employee login and manager override both run on PINs
  (see `docs/architecture/Team-Targét.dc.html`'s manager PIN override modal).
- Structured logging only, via `ILogger<T>`, one per class — see Preferred
  patterns, below, for the message-template convention.

## Async and concurrency

- **Atomic claims** (BOPIS claim-next-order, Held Sale resume — anywhere
  multiple registers could race for the same in-memory record) use a plain
  `lock` (`Monitor`) around the shared collection, not concurrent-collection
  compare-and-swap primitives. These are compound check-then-act operations
  (verify unclaimed, verify eligible, then claim, atomically) that a simple
  mutual-exclusion lock expresses more directly than `ConcurrentDictionary`'s
  atomic methods — and nothing awaited ever happens inside the lock, since
  there's no real datastore or I/O to await.
- Async policy otherwise follows Preferred patterns' Async I/O rule, below:
  nothing does real I/O yet, so nothing is `async` yet either — the moment
  something does (a real external call, e.g. to the auth provider), it goes
  `async` all the way up the call stack, no blocking on `.Result`/`.Wait()`.

## Preferred patterns

- **DI registration**: one `internal static class …ServiceCollectionExtensions`
  per concern, with an `Add<Thing>` extension method returning
  `IServiceCollection` for chaining. Register interfaces, not concrete types,
  from `Program.cs`. See
  [`ServiceCollectionExtensions.cs`](src/Tarjay.Team.Api/DependencyInjection/ServiceCollectionExtensions.cs).
- **Data access**: consumers depend on an interface (`IContactStore`-style),
  never on a concrete store/repository. This is non-negotiable even while
  the only implementation is in-memory — it's what makes swapping in a real
  datastore later a non-breaking change.
- **Controllers** stay thin: route, model bind, call one service/store
  method, map the result. No business logic in a controller action.
- **Guard clauses**: use `ArgumentNullException.ThrowIfNull(x)` at the top of
  public methods rather than manual `if (x is null) throw`.
- **Constructor injection**: use C# primary constructors for classes whose
  constructor only assigns injected dependencies to fields
  (`public class FooController(ILogger<FooController> logger) : ControllerBase`),
  not the manual `private readonly` field + assignment-body constructor
  `WeatherForecastController` uses today — that's template boilerplate, not
  the convention to copy.
- **Async I/O**: nothing in the API does real I/O yet, which is why every
  method today is synchronous — that's a consequence of having no database
  or outbound calls, not a pattern to extend. The moment a controller action
  or store method does real I/O (DB, HTTP, file, anything that awaits),
  it must be `async` and return `Task`/`Task<T>` all the way up the call
  stack. Don't block on `.Result`/`.Wait()` and don't add
  `ConfigureAwait(false)` (see Runtime & framework).
- **Configuration**: bind strongly-typed options classes from
  `IConfiguration` (`services.Configure<FooOptions>(config.GetSection("Foo"))`,
  consumed via `IOptions<FooOptions>`) once config grows past the current
  bare `Logging` section — don't scatter `configuration["Foo:Bar"]` indexer
  lookups through the codebase.
- **Logging**: inject `ILogger<T>` per class (already wired in
  `WeatherForecastController`, just unused there) and log with structured
  message templates — `_logger.LogInformation("Contact {ContactId} created",
  contact.ContactId)` — never string-interpolate the message itself.
- Anti-pattern: reaching for a new NuGet package before checking the BCL —
  this codebase is deliberately small; don't add a mapping library, a
  mediator library, or a validation library until there's a real, repeated
  need for one.
- Anti-pattern: putting persistence, HTTP, or serialization concerns inside
  `Domain`. If you're tempted to `using Microsoft.AspNetCore.*` or
  `using System.Text.Json` inside a `Domain` project, that code belongs in
  `Api` or `Infrastructure` instead.

## Internal libraries & shared code

Nothing shared exists yet — there is no `Tarjay.Team.Shared`/`Common`
project. If a helper is needed by more than one project, that's the signal
to create one rather than copy-pasting; don't create it in advance of a
second consumer.

## Infrastructure impact

Not every backend change stays inside `backend/` — some require a change in
`infrastructure/` too, and it's easy to miss that dependency since the two
surfaces build independently. Raise it as a question to the architect rather
than assuming a shape, per `infrastructure/CONVENTIONS.md`'s own rules:

- **Any new secret or config value this surface needs** doesn't just become
  an environment variable read in `Program.cs` — per
  `../infrastructure/CONVENTIONS.md`'s Configuration and secrets, a stack may
  only ever hold an SSM parameter's ARN, never the value itself. A new
  secret means a new SSM parameter needs to exist in `infrastructure/` before
  this surface can read it at runtime.
- **A new external dependency this surface talks to** — the real auth
  provider decided in House opinions, above, is the concrete example today —
  usually means new infrastructure to stand it up, network/security-group
  access to it, and secrets for it, none of which exists yet for Keycloak.
  This is exactly the kind of addition `../infrastructure/CONVENTIONS.md`'s
  Composition and dependencies section already gates ("adding a new
  Terraform provider or package is an architect decision, raise it as a
  question") — don't assume infra will just pick this up on its own.
- **This surface's own deployment shape** — how many services, what they run
  on — is `docs/architecture/ADR-backend-system-design.md` §7's deliberately
  unresolved question, restated in `../infrastructure/CONVENTIONS.md`'s
  Deliberately the specialist's call. A change here that implies an answer
  (e.g. splitting this API into two independently-deployed pieces) needs an
  infra conversation, not a unilateral choice.

## Error handling

**Global exception handling is decided, not a TODO.** It uses ASP.NET Core's
`IExceptionHandler` chain (`services.AddExceptionHandler<T>()` for each
handler, `services.AddProblemDetails()`, `app.UseExceptionHandler()`) — not
hand-rolled middleware. No handler exists in code yet; this is the shape to
build when the first one is needed, not a pattern to invent differently.

**Domain exceptions and HTTP concerns are two separate things — don't
conflate them.** Throw typed exceptions from `Domain` for domain-rule
violations (e.g. "not found", "already exists", "invalid state transition").
Give each a real name and message — `Tarjay.Team.Domain/Contact/ContactExceptions.cs`
is an empty stub today; don't replicate that. A domain exception type is
named for what went wrong (`ContactNotFoundException`, not a generic
catch-all), and derives from a common base per aggregate once there's more
than one exception type in that aggregate. **A domain exception never
carries an HTTP status code or anything else framework-specific** — that
would put an ASP.NET concern inside `Domain`, which has zero framework
references by design (see Project structure). The HTTP status a given
domain exception maps to is decided entirely on the handler side.

**One `IExceptionHandler` per aggregate.** `ContactExceptionHandler` (and one
per future aggregate, added when that aggregate gets its own real exception
types) catches only its own aggregate's domain exception types and maps each
to the HTTP status it deserves, returning ASP.NET Core's `ProblemDetails`
shape populated with real, specific detail about what happened — not a
generic message. Don't build one shared handler that switches across every
aggregate's exception types in one place; a new aggregate gets a new handler
class, not a new case in an existing one.

**A final fallback handler catches everything else — anything that isn't a
recognized domain exception.** That's the genuinely unexpected case: the
request never completed its normal contract. It:
- Returns a bare status code (`500`) with **no payload at all** — no
  `ProblemDetails`, nothing. The absence of a payload is itself the signal to
  the consumer that this wasn't a handled domain failure; a handled failure
  always has a `ProblemDetails` body, so a body's total absence means
  something broke before any domain logic could reason about it.
- **Always logs the full exception — message and stack trace, at `Error`
  level, via `ILogger<T>`, structured** — before returning. The client gets
  nothing, but nothing is silently dropped; the failure still exists in the
  logs. Logging here is not optional.

## Test levels

**This surface runs two levels: unit and integration.** No flow/E2E tests
live in `backend/` — that's the `e2e` surface's job, and today the `e2e`
suite doesn't call this API at all, since the frontend it drives is fully
mocked (see `../frontend/CONVENTIONS.md`'s Status and `../e2e/CONVENTIONS.md`).

**What each level means here:**
- **Framework**: xUnit everywhere. Domain/unit-test projects add
  `<Using Include="Xunit"/>` as a global using — don't repeat
  `using Xunit;` per file in those projects.
- **Unit tests** (`*.Domain.UnitTests`, one project per `src` project it
  covers): mock interfaces with **Moq**, one test class per type under test,
  named `<TypeUnderTest>Tests`. Test method names use the underscore-joined
  `MethodUnderTest_Scenario_ExpectedResult` shape — the `CA1707` (no
  underscores in identifiers) analyzer rule is explicitly suppressed in test
  projects for this reason, so use it. Structure the test body as
  Arrange/Act/Assert (blank line or `// Arrange` / `// Act` / `// Assert`
  comments between sections is fine); cover the success path, the failure
  path, and null/invalid-argument handling for anything with guard clauses.
- **Integration tests** (`*.Api.IntegrationTests`): spin up the real app via
  a `WebApplicationFactory<Program>` subclass (see
  [`ApiWebApplicationFactory.cs`](tests/Tarjay.Team.Api.IntegrationTests/ApiWebApplicationFactory.cs)),
  override only what must be stubbed for tests (e.g. pin OIDC discovery to a
  static document instead of hitting the network), and exercise the real DI
  graph through `factory.CreateClient()`. Don't mock things in an integration
  test that the Domain unit tests should already be covering — mock at the
  boundary (network, clock, external services), not internal collaborators.
- Test projects relax `CA1515`, `CA1707`, `CA2007` — these are noise for test
  code specifically; don't carry that `NoWarn` list into `src` projects.
- No coverage threshold is enforced yet (`coverlet.collector` is wired but
  nothing gates on it) — write tests for behavior, not to hit a number.

**How each is invoked:** `dotnet test` runs the whole solution (both
levels together — there's no single flag that separates them). To run one
level alone: `dotnet test tests/Tarjay.Team.Domain.UnitTests` for unit only,
`dotnet test tests/Tarjay.Team.Api.IntegrationTests` for integration only.
`dotnet test --filter "FullyQualifiedName~ContactStore"` runs a single test
class within either project.

**What this surface deliberately does not test:** no flow or multi-screen
user journeys here, regardless of level — that's the `e2e` surface's job
if and when it starts exercising a real backend.

**What this surface owes the surfaces that test it: everything, going
forward.** The frontend is meant to be fully real and production-built —
see `../frontend/CONVENTIONS.md`'s Status — which means every endpoint the
frontend needs must actually exist here, and `../e2e/CONVENTIONS.md`'s flows
will run against these endpoints for real once the frontend is wired to
them. As of this writing the frontend still runs on `Mock*Service` for most
features, so this is a stated near-term gap, not a permanent one: a change
to a response's shape will break the frontend and e2e, not just this
surface's own tests, the moment a feature is wired up for real.

## CI

Tests run in CI (both levels — see Test levels), then each service builds a
versioned container image and pushes it to ECR. `.github/workflows/backend.yml`
doesn't do this yet (checkout-only today) — this is the decided direction to
implement, not a pattern to invent differently. Two things this depends on
are still open, not this document's decision: exactly what the service
boundaries are, and what actually runs those images once pushed (see
`../infrastructure/CONVENTIONS.md`'s Deliberately the specialist's call).

## House opinions

- **Persistence is decided: there is no real database, ever.** Every
  feature's data comes from an in-memory implementation (thread-safe,
  singleton-registered, like `InMemoryContactStore`) — not as a placeholder
  for a future real store, but as the permanent shape. Which specific
  in-memory approach a given piece uses (a genuine in-memory collection
  performing real computation, vs. a hardcoded/seeded response with no
  computation behind it) is set per-piece in
  `docs/architecture/demo-build-tiering.md` — that document, not this one, is
  the source of truth for which tier a given feature is. Still define the
  interface in `Domain` regardless of tier (`IContactStore`-style) — that
  discipline doesn't change just because there's no real store to swap in
  later.
- **Auth is real, and is not on the tiering system data-serving logic uses.**
  Unlike persistence, auth is not something this project fakes — login routes
  through a real external identity provider (Keycloak), run as a
  self-contained instance in local docker-compose. This matches
  `docs/architecture/ADR-backend-system-design.md` §4's "corporate is the
  sole identity/credential authority" — Keycloak plays that role locally.
  Today, `Program.cs` still has no `AddAuthentication`/`AddJwtBearer` call and
  `appsettings.json` has no `Identity` section (`ApiWebApplicationFactory`'s
  JWT bearer setup is test-only scaffolding) — don't add `[Authorize]` or
  assume a bearer token is present until that's wired up for real. The
  destination is decided; the wiring itself isn't done yet.
- **Style**: file-scoped namespaces (`namespace Foo.Bar;`) everywhere, XML
  doc comments (`<summary>`) on public types and members in `Domain` that
  aren't self-explanatory from their name. See Code style for indentation,
  naming, and comment formatting specifics.
- Keep the solution flat until a layer earns its keep — don't pre-create
  `Application`/`Infrastructure` folders with nothing in them "for later."

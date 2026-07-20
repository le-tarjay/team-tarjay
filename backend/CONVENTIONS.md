# Backend Conventions

> Architect-owned. This document is optional but load-bearing: the Backend
> Specialist reads it and follows it. What you put here is what your generated
> backend code will look like. Effort in, quality out. Iterate it like code.

## Status

This surface is early — the only real code today is the default ASP.NET
`WeatherForecastController` template and a `Contact` sample module. The
`Contact` module's own comments describe it as a demo for Temporal
orchestration ("import flows", "activities", idempotent upserts) — **that
framing is not real**. No Temporal package, worker, or docker-compose exists
in this repo. Treat `Tarjay.Team.Domain/Contact/*` as disposable sample code,
not precedent, until it's replaced. Its low-level *syntax* (file-scoped
namespaces, 2-space indent, XML doc comments) does reflect the real house
style below.

Persistence and auth are intentionally undecided (see House opinions) —
don't invent a database or identity provider when generating code; ask or
stub it behind an interface.

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
- These settings live in [`Directory.Build.props`](Directory.Build.props) at
  the backend root and apply to every project — don't override them per-project.

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

## Error handling

No global exception handling exists yet (no `IExceptionHandler`, no
`UseExceptionHandler`, no `ProblemDetails` middleware) — this is a real gap,
not a deliberate choice, and should be treated as a TODO rather than copied.
Until it's added:

- Throw typed exceptions from `Domain` for domain-rule violations (e.g. "not
  found", "already exists", "invalid state transition"). Give each a real
  name and message — `Tarjay.Team.Domain/Contact/ContactExceptions.cs` is an
  empty stub today; don't replicate that. A domain exception type should be
  named for what went wrong (`ContactNotFoundException`, not a generic
  catch-all), and should derive from a common base per aggregate only once
  there's more than one exception type in that aggregate.
- Controllers translate known domain exceptions to the right HTTP status via
  a `try`/`catch` or (once introduced) a shared `IExceptionHandler` — don't
  let a domain exception surface as an unhandled 500 if it maps cleanly to a
  4xx.
- Return ASP.NET Core's built-in `ProblemDetails` shape for error responses,
  not a custom envelope.

## Testing style

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

## House opinions

- **Persistence is intentionally undecided.** Don't pick a database or ORM
  when generating code. If a feature needs to persist something, define the
  interface in `Domain` and provide an in-memory implementation (thread-safe,
  singleton-registered, like `InMemoryContactStore`) until a real datastore
  decision is made — that's a deliberate placeholder, not a shortcut to fix.
  Whatever the eventual store, queries are always parameterized (EF Core
  LINQ, or parameterized ADO.NET/Dapper) — never build SQL by string
  concatenation or interpolation.
- **Auth is not wired up.** `ApiWebApplicationFactory` configures JWT bearer
  options for tests, but `Program.cs` has no `AddAuthentication`/
  `AddJwtBearer` call and `appsettings.json` has no `Identity` section — this
  is leftover scaffolding, not a real auth posture. Don't add
  `[Authorize]` attributes or assume a bearer token is present until real
  auth is configured end-to-end (Program.cs, appsettings, and a real
  identity provider).
- **Style**: file-scoped namespaces (`namespace Foo.Bar;`) everywhere, 2-space
  indentation, XML doc comments (`<summary>`) on public types and members in
  `Domain` that aren't self-explanatory from their name.
- Keep the solution flat until a layer earns its keep — don't pre-create
  `Application`/`Infrastructure` folders with nothing in them "for later."

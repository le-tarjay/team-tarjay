using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.IntegrationTests.Identity;

/// <summary>
/// Hosts the real app for sign-in tests, with Keycloak — and only Keycloak — swapped out.
/// </summary>
/// <remarks>
/// The stub replaces <see cref="IEmployeeIdentityResolver"/>, which is the network boundary. Every
/// other thing under test is the real one: the real routing, the real validation filter, the real
/// exception-handler chain, the real serializer settings. That is the point — these tests are here
/// to prove the wiring, and stubbing anything inside it would prove nothing.
/// </remarks>
public sealed class EmployeeSignInFactory : WebApplicationFactory<Program>
{
    /// <summary>The stubbed identity provider each test sets the behavior of.</summary>
    public StubEmployeeIdentityResolver Resolver { get; } = new();

    /// <summary>Everything the app logged during the test.</summary>
    public CapturingLoggerProvider Logs { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseEnvironment("Development");

        builder.ConfigureLogging(logging => logging.AddProvider(Logs));

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IEmployeeIdentityResolver>();
            services.AddSingleton<IEmployeeIdentityResolver>(Resolver);
        });
    }
}

/// <summary>
/// A stand-in for the identity provider whose answer each test decides.
/// </summary>
public sealed class StubEmployeeIdentityResolver : IEmployeeIdentityResolver
{
    /// <summary>
    /// What to do when asked to resolve. Return an identity to accept the credentials; throw to
    /// simulate a rejection, an unreachable provider, or anything else.
    /// </summary>
    public Func<string, string, EmployeeIdentity> Behavior { get; set; } =
        (employeeId, _) => new EmployeeIdentity
        {
            EmployeeId = employeeId,
            Name = "Avery Brooks",
            Role = EmployeeRole.Associate,
            Department = "Grocery",
            JobFunction = "Register",
        };

    /// <summary>Every call the app made, so a test can assert one was never made at all.</summary>
    public List<ResolveCall> Calls { get; } = [];

    public Task<EmployeeIdentity> ResolveAsync(string employeeId, string pin, CancellationToken cancellationToken)
    {
        Calls.Add(new ResolveCall(employeeId, pin));

        return Task.FromResult(Behavior(employeeId, pin));
    }

    /// <summary>One call into the resolver.</summary>
    public sealed record ResolveCall(string EmployeeId, string Pin);
}

/// <summary>
/// Captures everything the app logs, so a test can assert that a PIN is not among it.
/// </summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentQueue<string> _lines = new();

    /// <summary>Every line logged by every category, at every level.</summary>
    public IReadOnlyCollection<string> Lines => _lines.ToArray();

    /// <summary>True if any logged line contains the given text.</summary>
    public bool ContainsText(string text) =>
        _lines.Any(line => line.Contains(text, StringComparison.Ordinal));

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, _lines);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(string categoryName, ConcurrentQueue<string> lines) : ILogger
    {
        public IDisposable BeginScope<TState>(TState state)
            where TState : notnull => NullScope.Instance;

        // Everything is enabled, so an assertion that a PIN never appears is genuinely given the
        // chance to fail rather than passing because the level was filtered out.
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            ArgumentNullException.ThrowIfNull(formatter);

            var line = $"{logLevel} {categoryName}: {formatter(state, exception)}";

            if (exception is not null)
            {
                line = $"{line} {exception}";
            }

            // The structured values too, not just the rendered message — a PIN passed as a
            // template argument would otherwise slip past an assertion that reads only the string.
            if (state is IEnumerable<KeyValuePair<string, object?>> values)
            {
                line = $"{line} {string.Join(" ", values.Select(value => $"{value.Key}={value.Value}"))}";
            }

            lines.Enqueue(line);
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();

            public void Dispose()
            {
            }
        }
    }
}

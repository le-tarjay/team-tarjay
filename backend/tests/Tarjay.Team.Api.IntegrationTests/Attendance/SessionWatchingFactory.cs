using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tarjay.Team.Api.IntegrationTests.Identity;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Api.IntegrationTests.Attendance;

/// <summary>
/// The real app, seeded with attendance records, with the two things that can change an employee's
/// session swapped for recorders — so a test can prove a shift transition never reached either.
/// </summary>
/// <remarks>
/// The only session state this API can act on lives in Keycloak, and the only two ways it reaches
/// Keycloak are the sign-in resolver and the Admin API session administrator. Both are network
/// boundaries, which is what an integration test is allowed to stub.
/// </remarks>
public sealed class SessionWatchingFactory(params AttendanceRecord[] records) : ApiWebApplicationFactory
{
    /// <summary>Records every sign-in resolution the app asks for.</summary>
    public StubEmployeeIdentityResolver Resolver { get; } = new();

    /// <summary>Records every session termination the app asks for.</summary>
    public RecordingSessionAdministrator SessionAdministrator { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IAttendanceStore>(new InMemoryAttendanceStore(records)));

            services.RemoveAll<IEmployeeIdentityResolver>();
            services.AddSingleton<IEmployeeIdentityResolver>(Resolver);

            services.RemoveAll<IKeycloakSessionAdministrator>();
            services.AddSingleton<IKeycloakSessionAdministrator>(SessionAdministrator);
        });
    }
}

/// <summary>A session administrator that ends nothing and remembers being asked.</summary>
public sealed class RecordingSessionAdministrator : IKeycloakSessionAdministrator
{
    private int _calls;

    /// <summary>How many times the app asked for sessions to be ended.</summary>
    public int Calls => _calls;

    public Task<int> TerminateOtherSessionsAsync(
        string userId,
        string currentSessionId,
        CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _calls);

        return Task.FromResult(0);
    }
}

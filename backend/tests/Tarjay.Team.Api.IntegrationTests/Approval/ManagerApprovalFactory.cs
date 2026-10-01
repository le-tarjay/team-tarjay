using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Logging;
using Tarjay.Team.Api.IntegrationTests.Identity;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.IntegrationTests.Approval;

/// <summary>
/// The real app for approval-check tests, with only the network under the approver credential
/// check replaced, and the attendance store starting from records a test chose.
/// </summary>
/// <remarks>
/// Everything between the request and Keycloak is the app's own: the JWT bearer registration, the
/// validation filter, the approval use case, the Keycloak credential check, the eligibility rule,
/// the attendance store, and the exception-handler chain.
/// </remarks>
public sealed class ManagerApprovalFactory(params AttendanceRecord[] records) : ApiWebApplicationFactory
{
    private readonly IReadOnlyList<AttendanceRecord> _records = records;

    /// <summary>The realm's token, userinfo, and logout endpoints, as the credential check reaches them.</summary>
    internal RecordingHandler Realm { get; } = new();

    /// <summary>Everything the app logged during the test.</summary>
    public CapturingLoggerProvider Logs { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        base.ConfigureWebHost(builder);

        // Every level reaches the capturing provider. The app's own configuration stops at
        // Information, and a PIN logged at Debug would otherwise pass unseen.
        builder.ConfigureLogging(logging => logging
            .AddProvider(Logs)
            .AddFilter<CapturingLoggerProvider>(category: null, LogLevel.Trace));

        builder.ConfigureTestServices(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IAttendanceStore>(new InMemoryAttendanceStore(_records)));

            services.Configure<HttpClientFactoryOptions>(
                nameof(IApproverCredentialCheck),
                options => options.HttpMessageHandlerBuilderActions.Add(handler => handler.PrimaryHandler = Realm));
        });
    }
}

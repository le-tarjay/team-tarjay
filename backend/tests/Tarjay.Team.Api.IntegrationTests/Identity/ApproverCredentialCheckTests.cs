using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Identity;

/// <summary>
/// The approver credential check as the app composes it, with only the network stubbed.
/// </summary>
public class ApproverCredentialCheckTests
{
    private const string ConfiguredRealm = "http://localhost:8080/realms/team-targe/";

    [Fact]
    public void ApproverCredentialCheck_IsTheKeycloakCheck()
    {
        // Arrange
        using var factory = new ApproverCheckFactory();

        // Act
        var check = factory.Services.GetRequiredService<IApproverCredentialCheck>();

        // Assert
        Assert.IsType<KeycloakApproverCredentialCheck>(check);
    }

    [Fact]
    public async Task CheckAsync_WithCorrectCredentials_ReturnsTheManagerAndEndsOnlyTheChecksOwnSession()
    {
        // Arrange
        using var factory = new ApproverCheckFactory();
        factory.Realm
            .Respond(HttpStatusCode.OK, """
                { "access_token": "check-access", "refresh_token": "check-refresh", "session_state": "s-1" }
                """)
            .Respond(HttpStatusCode.OK, """
                {
                  "sub": "u-20001",
                  "preferred_username": "20001",
                  "name": "Jordan Lee",
                  "store_role": "department-manager",
                  "department": "Electronics",
                  "job_function": "Management"
                }
                """)
            .Respond(HttpStatusCode.NoContent);

        var check = factory.Services.GetRequiredService<IApproverCredentialCheck>();

        // Act
        var result = await check.CheckAsync("20001", "9137", CancellationToken.None);

        // Assert — the manager comes back, the three calls all go to the configured store realm,
        // and the session administrator, which is what ends other sessions on sign-in, is never
        // called at all.
        Assert.Equal(ApproverCredentialOutcome.Valid, result.Outcome);
        Assert.Equal("Jordan Lee", result.Identity?.Name);
        Assert.Equal(EmployeeRole.DepartmentManager, result.Identity?.Role);

        Assert.Equal(
            ["token", "userinfo", "logout"],
            factory.Realm.Requests.Select(request => request.Uri.Segments.Last()).ToArray());
        Assert.All(
            factory.Realm.Requests,
            request => Assert.StartsWith(ConfiguredRealm, request.Uri.ToString(), StringComparison.Ordinal));
        Assert.Contains("refresh_token=check-refresh", factory.Realm.Requests[2].Body, StringComparison.Ordinal);

        Assert.Empty(factory.AdminApi.Requests);
    }

    [Fact]
    public async Task CheckAsync_WithAWrongPin_ReportsNotValid()
    {
        // Arrange
        using var factory = new ApproverCheckFactory();
        factory.Realm.Respond(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");

        var check = factory.Services.GetRequiredService<IApproverCredentialCheck>();

        // Act
        var result = await check.CheckAsync("20001", "0000", CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.NotValid, result.Outcome);
        Assert.Empty(factory.AdminApi.Requests);
    }

    [Fact]
    public async Task CheckAsync_WhenTheRealmIsDown_ReportsUnreachable()
    {
        // Arrange
        using var factory = new ApproverCheckFactory();
        factory.Realm.Fail(new HttpRequestException("Connection refused"));

        var check = factory.Services.GetRequiredService<IApproverCredentialCheck>();

        // Act
        var result = await check.CheckAsync("20001", "9137", CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
    }

    /// <summary>
    /// The app with the network under the approver check, and under the session administrator,
    /// replaced by recording stubs.
    /// </summary>
    private sealed class ApproverCheckFactory : ApiWebApplicationFactory
    {
        public RecordingHandler Realm { get; } = new();

        public RecordingHandler AdminApi { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);

            builder.ConfigureTestServices(services =>
            {
                UsePrimaryHandler(services, nameof(IApproverCredentialCheck), Realm);
                UsePrimaryHandler(services, nameof(IKeycloakSessionAdministrator), AdminApi);
            });
        }

        private static void UsePrimaryHandler(IServiceCollection services, string clientName, HttpMessageHandler handler) =>
            services.Configure<HttpClientFactoryOptions>(
                clientName,
                options => options.HttpMessageHandlerBuilderActions.Add(builder => builder.PrimaryHandler = handler));
    }
}

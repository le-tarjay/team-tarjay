using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Infrastructure.UnitTests.Identity;

public class KeycloakSessionAdministratorTests
{
    private const string UserId = "d1b0a4f2-0000-0000-0000-000000000001";
    private const string CurrentSession = "9f3c77b1-2222-2222-2222-222222222222";
    private const string OtherSession = "5ac10e44-3333-3333-3333-333333333333";
    private const string AdminSecret = "an-admin-secret";

    private const string AdminTokenResponse = """
        { "access_token": "an-admin-token", "expires_in": 60, "token_type": "Bearer" }
        """;

    private const string TwoSessions = $$"""
        [
          { "id": "{{CurrentSession}}", "ipAddress": "10.0.0.7" },
          { "id": "{{OtherSession}}", "ipAddress": "10.0.0.9" }
        ]
        """;

    private const string OnlyTheCurrentSession = $$"""
        [ { "id": "{{CurrentSession}}", "ipAddress": "10.0.0.7" } ]
        """;

    [Fact]
    public async Task TerminateOtherSessionsAsync_WithASessionOnAnotherDevice_EndsThatSession()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, TwoSessions)
            .RespondWith(HttpStatusCode.NoContent);

        var administrator = CreateAdministrator(handler, out _);

        // Act
        var ended = await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert
        Assert.Equal(1, ended);

        var deletion = handler.Requests.Last();
        Assert.Equal(HttpMethod.Delete, deletion.Method);
        Assert.Equal(
            $"https://keycloak.test/admin/realms/team-targe/sessions/{OtherSession}",
            deletion.RequestUri?.ToString());
        Assert.Equal("an-admin-token", deletion.BearerToken);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_NeverEndsTheSessionTheSignInJustCreated()
    {
        // Arrange — the whole point of naming sessions individually rather than logging the user
        // out wholesale: the tokens this sign-in is about to hand back have to still work.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, TwoSessions)
            .RespondWith(HttpStatusCode.NoContent);

        var administrator = CreateAdministrator(handler, out _);

        // Act
        await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert
        var deletions = handler.Requests.Where(request => request.Method == HttpMethod.Delete).ToList();

        Assert.Single(deletions);
        Assert.DoesNotContain(deletions, request => request.RequestUri!.ToString().Contains(CurrentSession, StringComparison.Ordinal));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WithSeveralOtherSessions_EndsEveryOneOfThem()
    {
        // Arrange — a register the employee forgot to sign out of, plus a handheld.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, $$"""
                [
                  { "id": "{{CurrentSession}}" },
                  { "id": "session-on-register-4" },
                  { "id": "session-on-handheld-2" }
                ]
                """)
            .RespondWith(HttpStatusCode.NoContent)
            .RespondWith(HttpStatusCode.NoContent);

        var administrator = CreateAdministrator(handler, out _);

        // Act
        var ended = await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert
        Assert.Equal(2, ended);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WithNoOtherSession_SucceedsWithoutEndingAnything()
    {
        // Arrange — the ordinary case: an employee signing in with nothing else open.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, OnlyTheCurrentSession);

        var administrator = CreateAdministrator(handler, out _);

        // Act
        var ended = await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert — a no-op that succeeds trivially, not a failure to be reported to the employee.
        Assert.Equal(0, ended);
        Assert.DoesNotContain(handler.Requests, request => request.Method == HttpMethod.Delete);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_AuthenticatesAsTheServiceAccountNotTheEmployee()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, OnlyTheCurrentSession);

        var administrator = CreateAdministrator(handler, out _);

        // Act
        await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert — the client-credentials grant against the confidential client, never the
        // employee-facing client and never the compose stack's bootstrap admin.
        var tokenRequest = handler.Requests[0];
        Assert.Equal(HttpMethod.Post, tokenRequest.Method);
        Assert.Equal(
            "https://keycloak.test/realms/team-targe/protocol/openid-connect/token",
            tokenRequest.RequestUri?.ToString());
        Assert.Contains("grant_type=client_credentials", tokenRequest.Body, StringComparison.Ordinal);
        Assert.Contains("client_id=team-targe-admin", tokenRequest.Body, StringComparison.Ordinal);

        var listRequest = handler.Requests[1];
        Assert.Equal(HttpMethod.Get, listRequest.Method);
        Assert.Equal(
            $"https://keycloak.test/admin/realms/team-targe/users/{UserId}/sessions",
            listRequest.RequestUri?.ToString());
        Assert.Equal("an-admin-token", listRequest.BearerToken);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WithNoAdminClientConfigured_FailsWithoutCallingAnything()
    {
        // Arrange — a deployment that cannot keep the single-session promise must not sign anyone
        // in as though it could.
        var handler = new StubHttpMessageHandler();
        var administrator = CreateAdministrator(handler, out _, adminClientId: string.Empty);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WithNoAdminSecretConfigured_FailsWithoutCallingAnything()
    {
        // Arrange
        var handler = new StubHttpMessageHandler();
        var administrator = CreateAdministrator(handler, out _, adminSecret: string.Empty);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task TerminateOtherSessionsAsync_WhenTheServiceAccountIsRefused_Fails(HttpStatusCode statusCode)
    {
        // Arrange
        var handler = new StubHttpMessageHandler().RespondWith(statusCode);
        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenTheSessionListCannotBeRead_Fails()
    {
        // Arrange — not knowing which sessions exist is not the same as there being none.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.Forbidden);

        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenASessionCannotBeEnded_Fails()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, TwoSessions)
            .RespondWith(HttpStatusCode.InternalServerError);

        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert — the other device is still signed in, so reporting success here would be a
        // lie the store never finds out about.
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenASessionIsAlreadyGone_TreatsItAsEnded()
    {
        // Arrange — two devices signing in at nearly the same moment: the other one's session was
        // listed, then ended by something else before this call reached it.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, TwoSessions)
            .RespondWith(HttpStatusCode.NotFound);

        var administrator = CreateAdministrator(handler, out _);

        // Act
        var ended = await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert — the session is gone, which is what was asked for. It is not counted, because
        // this call is not what ended it.
        Assert.Equal(0, ended);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenTheConnectionFails_Fails()
    {
        // Arrange
        var handler = new StubHttpMessageHandler().Throws(new HttpRequestException("Connection refused"));
        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenTheAdminApiTimesOut_Fails()
    {
        // Arrange — how HttpClient surfaces its own timeout elapsing.
        var handler = new StubHttpMessageHandler()
            .Throws(new TaskCanceledException("The request timed out.", new TimeoutException()));

        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenTheCallerCancels_ThrowsCancellationRatherThanFailure()
    {
        // Arrange — the caller giving up is not the store failing to end a session.
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();

        var handler = new StubHttpMessageHandler().Throws(new OperationCanceledException(cancellation.Token));
        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, cancellation.Token));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WhenTheAdminApiAnswersWithSomethingOtherThanAList_Fails()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, """{ "error": "not what was asked for" }""");

        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_OnSuccess_NeverLogsTheSecretOrTheAdminToken()
    {
        // Arrange — the service account's credentials are held to the same rule as an employee's.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, TwoSessions)
            .RespondWith(HttpStatusCode.NoContent);

        var administrator = CreateAdministrator(handler, out var logger);

        // Act
        await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert
        Assert.NotEmpty(logger.Lines);
        Assert.False(logger.ContainsText(AdminSecret), "The admin client secret appeared in a log line.");
        Assert.False(logger.ContainsText("an-admin-token"), "The admin access token appeared in a log line.");
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_OnFailure_NeverPutsTheSecretInTheExceptionMessage()
    {
        // Arrange — an exception message reaches a log line by another route, so it is held to the
        // same rule as a log call.
        var handler = new StubHttpMessageHandler().RespondWith(HttpStatusCode.Unauthorized);
        var administrator = CreateAdministrator(handler, out _);

        // Act
        var failure = await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None));

        // Assert
        Assert.DoesNotContain(AdminSecret, failure.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task TerminateOtherSessionsAsync_WithoutAUserId_ThrowsArgumentException(string? userId)
    {
        // Arrange
        var handler = new StubHttpMessageHandler();
        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => administrator.TerminateOtherSessionsAsync(userId!, CurrentSession, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task TerminateOtherSessionsAsync_WithoutACurrentSession_ThrowsArgumentException(string? sessionId)
    {
        // Arrange — without knowing which session to keep, every session is "another" one, and
        // this call would end the sign-in that asked for it.
        var handler = new StubHttpMessageHandler();
        var administrator = CreateAdministrator(handler, out _);

        // Act / Assert
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => administrator.TerminateOtherSessionsAsync(UserId, sessionId!, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task TerminateOtherSessionsAsync_WithATrailingSlashOnTheAuthority_StillBuildsUsableUrls()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, AdminTokenResponse)
            .RespondWith(HttpStatusCode.OK, OnlyTheCurrentSession);

        var administrator = CreateAdministrator(handler, out _, authority: "https://keycloak.test/");

        // Act
        await administrator.TerminateOtherSessionsAsync(UserId, CurrentSession, CancellationToken.None);

        // Assert
        Assert.Equal(
            $"https://keycloak.test/admin/realms/team-targe/users/{UserId}/sessions",
            handler.Requests[1].RequestUri?.ToString());
    }

    private static KeycloakSessionAdministrator CreateAdministrator(
        StubHttpMessageHandler handler,
        out CapturingLogger<KeycloakSessionAdministrator> logger,
        string authority = "https://keycloak.test",
        string adminClientId = "team-targe-admin",
        string adminSecret = AdminSecret)
    {
        logger = new CapturingLogger<KeycloakSessionAdministrator>();

        var options = Options.Create(new KeycloakOptions
        {
            Authority = authority,
            Realm = "team-targe",
            ClientId = "team-targe-store",
            ClientSecret = "a-secret",
            Admin = new KeycloakAdminOptions
            {
                ClientId = adminClientId,
                ClientSecret = adminSecret,
            },
        });

        return new KeycloakSessionAdministrator(new HttpClient(handler), options, logger);
    }
}

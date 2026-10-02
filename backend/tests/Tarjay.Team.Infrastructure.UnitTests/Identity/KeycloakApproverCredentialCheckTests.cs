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

public class KeycloakApproverCredentialCheckTests
{
    private const string Authority = "https://store-keycloak.test";
    private const string EmployeeId = "20001";
    private const string Pin = "9137";
    private const string AccessToken = "the-checks-access-token";
    private const string RefreshToken = "the-checks-refresh-token";

    private const string TokenUrl = Authority + "/realms/team-targe/protocol/openid-connect/token";
    private const string UserInfoUrl = Authority + "/realms/team-targe/protocol/openid-connect/userinfo";
    private const string LogoutUrl = Authority + "/realms/team-targe/protocol/openid-connect/logout";

    private const string TokenResponse = """
        {
          "access_token": "the-checks-access-token",
          "refresh_token": "the-checks-refresh-token",
          "session_state": "5c1d0e2a-3333-3333-3333-333333333333",
          "expires_in": 300,
          "token_type": "Bearer"
        }
        """;

    private const string ManagerUserInfo = """
        {
          "sub": "d1b0a4f2-0000-0000-0000-000000000020",
          "preferred_username": "20001",
          "name": "Jordan Lee",
          "store_role": "department-manager",
          "department": "Electronics",
          "job_function": "Management"
        }
        """;

    // Keycloak answers a wrong PIN, an unknown username, and a temporarily locked-out user on the
    // password grant with the same status. These are the bodies it sends for each.
    private const string WrongPinOrUnknownIdBody = """
        { "error": "invalid_grant", "error_description": "Invalid user credentials" }
        """;

    private const string LockedOutBody = """
        { "error": "invalid_grant", "error_description": "Account temporarily disabled" }
        """;

    [Fact]
    public async Task CheckAsync_WithCorrectCredentials_ReturnsTheManagersIdentity()
    {
        // Arrange
        var handler = HandlerForAcceptedCheck();
        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Valid, result.Outcome);
        Assert.NotNull(result.Identity);
        Assert.Equal("20001", result.Identity.EmployeeId);
        Assert.Equal("Jordan Lee", result.Identity.Name);
        Assert.Equal(EmployeeRole.DepartmentManager, result.Identity.Role);
        Assert.Equal("Electronics", result.Identity.Department);
        Assert.Equal("Management", result.Identity.JobFunction);
    }

    [Fact]
    public async Task CheckAsync_WithCorrectCredentials_ReadsTheSameAuthorityTheSharedReadReturns()
    {
        // Arrange
        var check = CreateCheck(HandlerForAcceptedCheck(), out _);

        using var claims = System.Text.Json.JsonDocument.Parse(ManagerUserInfo);
        var shared = KeycloakIdentityClaims.ReadAuthority(
            claims.RootElement,
            new KeycloakOptions(),
            detail => new EmployeeIdentityIncompleteException(detail));

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.NotNull(result.Identity);
        Assert.Equal(shared.Role, result.Identity.Role);
        Assert.Equal(shared.Department, result.Identity.Department);
        Assert.Equal(shared.JobFunction, result.Identity.JobFunction);
    }

    [Fact]
    public async Task CheckAsync_WithCorrectCredentials_VerifiesThenReadsThenEndsOnlyTheSessionItCreated()
    {
        // Arrange
        var handler = HandlerForAcceptedCheck();
        var check = CreateCheck(handler, out _);

        // Act
        await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — exactly three calls, and the last one names the check's own session by the
        // refresh token the check's own grant issued.
        Assert.Equal(3, handler.Requests.Count);

        var token = handler.Requests[0];
        Assert.Equal(HttpMethod.Post, token.Method);
        Assert.Equal(TokenUrl, token.RequestUri?.ToString());
        Assert.Contains("grant_type=password", token.Body, StringComparison.Ordinal);
        Assert.Contains("username=20001", token.Body, StringComparison.Ordinal);

        var userInfo = handler.Requests[1];
        Assert.Equal(HttpMethod.Get, userInfo.Method);
        Assert.Equal(UserInfoUrl, userInfo.RequestUri?.ToString());
        Assert.Equal(AccessToken, userInfo.BearerToken);

        var logout = handler.Requests[2];
        Assert.Equal(HttpMethod.Post, logout.Method);
        Assert.Equal(LogoutUrl, logout.RequestUri?.ToString());
        Assert.Contains("refresh_token=" + RefreshToken, logout.Body, StringComparison.Ordinal);
        Assert.Contains("client_id=team-targe-store", logout.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CheckAsync_WithCorrectCredentials_LeavesTheManagersOtherSessionsUntouched()
    {
        // Arrange
        var handler = HandlerForAcceptedCheck();
        var check = CreateCheck(handler, out _);

        // Act
        await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — nothing reaches the Admin API, so no session is listed and none is deleted.
        // The only session ended is named by the check's own refresh token.
        Assert.DoesNotContain(handler.Requests, request => IsAdminApi(request.RequestUri));
        Assert.DoesNotContain(handler.Requests, request => request.Method == HttpMethod.Delete);
        Assert.Single(handler.Requests, request => request.RequestUri?.ToString() == LogoutUrl);
    }

    [Fact]
    public async Task CheckAsync_WithCorrectCredentials_CallsOnlyTheConfiguredStoreRealm()
    {
        // Arrange
        var handler = HandlerForAcceptedCheck();
        var check = CreateCheck(handler, out _);

        // Act
        await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.All(
            handler.Requests,
            request => Assert.StartsWith(Authority + "/realms/team-targe/", request.RequestUri?.ToString(), StringComparison.Ordinal));
    }

    [Fact]
    public async Task CheckAsync_WithAWrongPin_ReportsNotValid()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, WrongPinOrUnknownIdBody);

        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — and no session was created, so there is nothing to end.
        Assert.Equal(ApproverCredentialOutcome.NotValid, result.Outcome);
        Assert.Null(result.Identity);
        Assert.Single(handler.Requests);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task CheckAsync_WhenTheTokenEndpointRefuses_ReportsNotValid(HttpStatusCode status)
    {
        // Arrange
        var handler = new StubHttpMessageHandler().RespondWith(status, WrongPinOrUnknownIdBody);
        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.NotValid, result.Outcome);
    }

    [Fact]
    public async Task CheckAsync_WithAnUnknownEmployeeId_ReportsTheSameResultAsAWrongPin()
    {
        // Arrange
        var unknownHandler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, WrongPinOrUnknownIdBody);
        var wrongPinHandler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, WrongPinOrUnknownIdBody);

        var unknownCheck = CreateCheck(unknownHandler, out var unknownLogger);
        var wrongPinCheck = CreateCheck(wrongPinHandler, out var wrongPinLogger);

        // Act
        var unknown = await unknownCheck.CheckAsync("99999", Pin, CancellationToken.None);
        var wrongPin = await wrongPinCheck.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — the same result, and log lines that differ only in the Employee ID entered.
        Assert.Equal(ApproverCredentialOutcome.NotValid, unknown.Outcome);
        Assert.Same(wrongPin, unknown);
        Assert.Equal(
            wrongPinLogger.Lines.Select(line => line.Replace(EmployeeId, "{id}", StringComparison.Ordinal)),
            unknownLogger.Lines.Select(line => line.Replace("99999", "{id}", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task CheckAsync_WithALockedOutManagersCorrectPin_ReportsTheSameResultAsAWrongPin()
    {
        // Arrange
        var lockedHandler = new StubHttpMessageHandler().RespondWith(HttpStatusCode.BadRequest, LockedOutBody);
        var wrongPinHandler = new StubHttpMessageHandler().RespondWith(HttpStatusCode.Unauthorized, WrongPinOrUnknownIdBody);

        // Act
        var locked = await CreateCheck(lockedHandler, out _).CheckAsync(EmployeeId, Pin, CancellationToken.None);
        var wrongPin = await CreateCheck(wrongPinHandler, out _).CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.NotValid, locked.Outcome);
        Assert.Null(locked.Identity);
        Assert.Same(wrongPin, locked);
    }

    [Fact]
    public async Task CheckAsync_WhenTheConnectionFails_ReportsUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler().Throws(new HttpRequestException("Connection refused"));
        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
        Assert.Null(result.Identity);
    }

    [Fact]
    public async Task CheckAsync_WhenTheRequestTimesOut_ReportsUnreachable()
    {
        // Arrange — the client's own timeout, not the caller cancelling.
        var handler = new StubHttpMessageHandler().Throws(new TaskCanceledException("The request timed out."));
        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.BadGateway)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.NotFound)]
    public async Task CheckAsync_WhenTheTokenEndpointFails_ReportsUnreachableRatherThanNotValid(HttpStatusCode status)
    {
        // Arrange
        var handler = new StubHttpMessageHandler().RespondWith(status, "{}");
        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
    }

    [Fact]
    public async Task CheckAsync_WhenTheTokenResponseIsNotJson_ReportsUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler().RespondWith(HttpStatusCode.OK, "<html>proxy error</html>");
        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
    }

    [Fact]
    public async Task CheckAsync_WhenTheGrantIssuesNoRefreshToken_ReportsUnreachable()
    {
        // Arrange — without the refresh token the check could not end the session it created.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, """{ "access_token": "the-checks-access-token" }""");

        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task CheckAsync_WhenTheIdentityReadFails_ReportsUnreachableAndStillEndsTheSession()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.InternalServerError, "{}")
            .RespondWith(HttpStatusCode.NoContent);

        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
        Assert.Equal(LogoutUrl, handler.Requests[2].RequestUri?.ToString());
        Assert.Contains("refresh_token=" + RefreshToken, handler.Requests[2].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CheckAsync_WhenTheCheckSessionCannotBeEnded_ReportsUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, ManagerUserInfo)
            .RespondWith(HttpStatusCode.InternalServerError);

        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — a check that cannot finish is not reported as an approval.
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
        Assert.Null(result.Identity);
        Assert.Equal(3, handler.Requests.Count);
    }

    [Fact]
    public async Task CheckAsync_WhenTheLogoutConnectionFails_ReportsUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, ManagerUserInfo)
            .Throws(new HttpRequestException("Connection reset"));

        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
    }

    [Fact]
    public async Task CheckAsync_WhenTheIdentityHasNoTier_ThrowsIncompleteAndStillEndsTheSession()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, """
                {
                  "sub": "d1b0a4f2-0000-0000-0000-000000000020",
                  "preferred_username": "20001",
                  "name": "Jordan Lee",
                  "department": "Electronics",
                  "job_function": "Management"
                }
                """)
            .RespondWith(HttpStatusCode.NoContent);

        var check = CreateCheck(handler, out _);

        // Act
        var exception = await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
            () => check.CheckAsync(EmployeeId, Pin, CancellationToken.None));

        // Assert
        Assert.Contains("store_role", exception.Message, StringComparison.Ordinal);
        Assert.Equal(LogoutUrl, handler.Requests[2].RequestUri?.ToString());
    }

    [Fact]
    public async Task CheckAsync_WhenTheIdentityHasNoDepartment_ReturnsItWithAnEmptyDepartment()
    {
        // Arrange — the shared read's tolerance, unchanged. The eligibility rule decides what an
        // empty department means.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, """
                {
                  "preferred_username": "20001",
                  "name": "Jordan Lee",
                  "store_role": "store-manager"
                }
                """)
            .RespondWith(HttpStatusCode.NoContent);

        var check = CreateCheck(handler, out _);

        // Act
        var result = await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Valid, result.Outcome);
        Assert.NotNull(result.Identity);
        Assert.Equal(EmployeeRole.StoreManager, result.Identity.Role);
        Assert.Equal(string.Empty, result.Identity.Department);
        Assert.Equal(string.Empty, result.Identity.JobFunction);
    }

    [Fact]
    public async Task CheckAsync_WhenTheCallerGivesUpAfterTheGrant_StillEndsTheSession()
    {
        // Arrange
        using var caller = new CancellationTokenSource();

        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(_ =>
            {
                caller.Cancel();
                throw new OperationCanceledException(caller.Token);
            })
            .RespondWith(HttpStatusCode.NoContent);

        var check = CreateCheck(handler, out _);

        // Act
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => check.CheckAsync(EmployeeId, Pin, caller.Token));

        // Assert
        Assert.Equal(3, handler.Requests.Count);
        Assert.Equal(LogoutUrl, handler.Requests[2].RequestUri?.ToString());
    }

    [Fact]
    public async Task CheckAsync_WithAConfiguredClientSecret_SendsItOnTheGrantAndTheLogout()
    {
        // Arrange
        var handler = HandlerForAcceptedCheck();
        var check = CreateCheck(handler, out _, clientSecret: "a-secret");

        // Act
        await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Contains("client_secret=a-secret", handler.Requests[0].Body, StringComparison.Ordinal);
        Assert.Contains("client_secret=a-secret", handler.Requests[2].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CheckAsync_OnEveryOutcome_NeverLogsThePinOrTheTokens()
    {
        // Arrange
        var handlers = new[]
        {
            HandlerForAcceptedCheck(),
            new StubHttpMessageHandler().RespondWith(HttpStatusCode.Unauthorized, WrongPinOrUnknownIdBody),
            new StubHttpMessageHandler().RespondWith(HttpStatusCode.BadRequest, LockedOutBody),
            new StubHttpMessageHandler().Throws(new HttpRequestException("Connection refused")),
            new StubHttpMessageHandler()
                .RespondWith(HttpStatusCode.OK, TokenResponse)
                .RespondWith(HttpStatusCode.OK, ManagerUserInfo)
                .RespondWith(HttpStatusCode.BadRequest),
        };

        foreach (var handler in handlers)
        {
            var check = CreateCheck(handler, out var logger);

            // Act
            await check.CheckAsync(EmployeeId, Pin, CancellationToken.None);

            // Assert
            Assert.NotEmpty(logger.Lines);
            Assert.False(logger.ContainsText(Pin), $"The PIN appeared in a log line: {string.Join(" | ", logger.Lines)}");
            Assert.False(logger.ContainsText(AccessToken), "The access token appeared in a log line.");
            Assert.False(logger.ContainsText(RefreshToken), "The refresh token appeared in a log line.");
        }
    }

    [Fact]
    public async Task CheckAsync_WhenTheIdentityIsIncomplete_NeverPutsThePinInTheExceptionMessage()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, """{ "store_role": "regional-director" }""")
            .RespondWith(HttpStatusCode.NoContent);

        var check = CreateCheck(handler, out _);

        // Act
        var exception = await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
            () => check.CheckAsync(EmployeeId, Pin, CancellationToken.None));

        // Assert
        Assert.DoesNotContain(Pin, exception.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null, Pin)]
    [InlineData("", Pin)]
    [InlineData("   ", Pin)]
    [InlineData(EmployeeId, null)]
    [InlineData(EmployeeId, "")]
    [InlineData(EmployeeId, "   ")]
    public async Task CheckAsync_WithAMissingEmployeeIdOrPin_ThrowsWithoutCallingTheAuthority(string? employeeId, string? pin)
    {
        // Arrange
        var handler = new StubHttpMessageHandler();
        var check = CreateCheck(handler, out _);

        // Act
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => check.CheckAsync(employeeId!, pin!, CancellationToken.None));

        // Assert
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public void Constructor_WithNullDependencies_Throws()
    {
        // Arrange
        using var httpClient = new HttpClient(new StubHttpMessageHandler());
        var options = Options.Create(new KeycloakOptions());
        var logger = new CapturingLogger<KeycloakApproverCredentialCheck>();

        // Act and assert
        Assert.Throws<ArgumentNullException>(() => new KeycloakApproverCredentialCheck(null!, options, logger));
        Assert.Throws<ArgumentNullException>(() => new KeycloakApproverCredentialCheck(httpClient, null!, logger));
        Assert.Throws<ArgumentNullException>(() => new KeycloakApproverCredentialCheck(httpClient, options, null!));
    }

    private static StubHttpMessageHandler HandlerForAcceptedCheck() =>
        new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, ManagerUserInfo)
            .RespondWith(HttpStatusCode.NoContent);

    private static bool IsAdminApi(Uri? uri) =>
        uri is not null && uri.AbsolutePath.StartsWith("/admin/", StringComparison.Ordinal);

    private static KeycloakApproverCredentialCheck CreateCheck(
        StubHttpMessageHandler handler,
        out CapturingLogger<KeycloakApproverCredentialCheck> logger,
        string clientSecret = "")
    {
        logger = new CapturingLogger<KeycloakApproverCredentialCheck>();

        // The admin client is configured, so a check that reached for the Admin API would be able
        // to. The tests above assert that it never does.
        var options = Options.Create(new KeycloakOptions
        {
            Authority = Authority,
            Realm = "team-targe",
            ClientId = "team-targe-store",
            ClientSecret = clientSecret,
            Admin = new KeycloakAdminOptions
            {
                ClientId = "team-targe-admin",
                ClientSecret = "an-admin-secret",
            },
        });

        return new KeycloakApproverCredentialCheck(new HttpClient(handler), options, logger);
    }
}

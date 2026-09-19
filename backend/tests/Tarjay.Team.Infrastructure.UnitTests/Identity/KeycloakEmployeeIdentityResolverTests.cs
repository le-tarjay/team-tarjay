using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Infrastructure.UnitTests.Identity;

public class KeycloakEmployeeIdentityResolverTests
{
    private const string EmployeeId = "100482";
    private const string Pin = "8321";
    private const string Subject = "d1b0a4f2-0000-0000-0000-000000000001";
    private const string SessionState = "9f3c77b1-2222-2222-2222-222222222222";

    private const string TokenResponse = """
        {
          "access_token": "an-access-token",
          "refresh_token": "a-refresh-token",
          "session_state": "9f3c77b1-2222-2222-2222-222222222222",
          "expires_in": 300,
          "token_type": "Bearer"
        }
        """;

    private const string UserInfoResponse = """
        {
          "sub": "d1b0a4f2-0000-0000-0000-000000000001",
          "preferred_username": "100482",
          "name": "Avery Brooks",
          "store_role": "department-manager",
          "department": "Grocery",
          "job_function": "Customer Support"
        }
        """;

    [Fact]
    public async Task ResolveAsync_WithValidCredentials_ResolvesRoleDepartmentAndJobFunction()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var resolver = CreateResolver(handler, out _);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal("100482", session.Identity.EmployeeId);
        Assert.Equal("Avery Brooks", session.Identity.Name);
        Assert.Equal(EmployeeRole.DepartmentManager, session.Identity.Role);
        Assert.Equal("Grocery", session.Identity.Department);
        Assert.Equal("Customer Support", session.Identity.JobFunction);
    }

    [Fact]
    public async Task ResolveAsync_WithValidCredentials_KeepsBothTokensTheGrantIssued()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var resolver = CreateResolver(handler, out _);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — both are passed through exactly as Keycloak issued them. The refresh token in
        // particular used to be read and dropped on the floor, which left the device with no way
        // to ever find out its session had ended.
        Assert.Equal("an-access-token", session.AccessToken);
        Assert.Equal("a-refresh-token", session.RefreshToken);
    }

    [Fact]
    public async Task ResolveAsync_WithValidCredentials_VerifiesCredentialsThenReadsIdentity()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var resolver = CreateResolver(handler, out _);

        // Act
        await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(2, handler.Requests.Count);

        var tokenRequest = handler.Requests[0];
        Assert.Equal(HttpMethod.Post, tokenRequest.Method);
        Assert.Equal(
            "https://keycloak.test/realms/team-targe/protocol/openid-connect/token",
            tokenRequest.RequestUri?.ToString());
        Assert.Contains("grant_type=password", tokenRequest.Body, StringComparison.Ordinal);
        Assert.Contains("username=100482", tokenRequest.Body, StringComparison.Ordinal);

        var userInfoRequest = handler.Requests[1];
        Assert.Equal(HttpMethod.Get, userInfoRequest.Method);
        Assert.Equal(
            "https://keycloak.test/realms/team-targe/protocol/openid-connect/userinfo",
            userInfoRequest.RequestUri?.ToString());

        // The identity lookup must present the token the credential check just earned, rather than
        // asking the provider about an employee it has not proved it is allowed to ask about.
        Assert.Equal("an-access-token", userInfoRequest.BearerToken);
    }

    [Theory]
    [InlineData("associate", EmployeeRole.Associate)]
    [InlineData("Associate", EmployeeRole.Associate)]
    [InlineData("department-manager", EmployeeRole.DepartmentManager)]
    [InlineData("department_manager", EmployeeRole.DepartmentManager)]
    [InlineData("DepartmentManager", EmployeeRole.DepartmentManager)]
    [InlineData("store-manager", EmployeeRole.StoreManager)]
    [InlineData("STORE_MANAGER", EmployeeRole.StoreManager)]
    [InlineData("receiving-associate", EmployeeRole.ReceivingAssociate)]
    public async Task ResolveAsync_WithRoleClaim_MapsToTheStoreRole(string roleClaim, EmployeeRole expected)
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfo(role: roleClaim));

        var resolver = CreateResolver(handler, out _);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(expected, session.Identity.Role);
    }

    [Fact]
    public async Task ResolveAsync_WithValidCredentials_EndsTheEmployeesOtherSessionsBeforeReturning()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var administrator = new StubSessionAdministrator();
        var resolver = CreateResolver(handler, out _, administrator: administrator);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — the employee is named by the realm's own id, and the session just created is
        // named as the one to keep, so "their other sessions" means exactly that.
        var call = Assert.Single(administrator.Calls);
        Assert.Equal(Subject, call.UserId);
        Assert.Equal(SessionState, call.CurrentSessionId);
        Assert.Equal("an-access-token", session.AccessToken);
    }

    [Fact]
    public async Task ResolveAsync_WithValidCredentials_WaitsForTheTerminationRatherThanAnsweringOverIt()
    {
        // Arrange — a termination held open, so "before responding" is something the test can
        // actually see rather than infer.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var gate = new TaskCompletionSource();
        var administrator = new StubSessionAdministrator { Gate = gate.Task };
        var resolver = CreateResolver(handler, out _, administrator: administrator);

        // Act
        var resolving = resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert — sign-in is still outstanding while the other sessions are still live. A caller
        // that got its tokens here would be holding them alongside the session they were meant to
        // replace.
        Assert.False(resolving.IsCompleted);
        Assert.Single(administrator.Calls);

        gate.SetResult();

        var session = await resolving;
        Assert.Equal("an-access-token", session.AccessToken);
    }

    [Fact]
    public async Task ResolveAsync_WithNoOtherSessionOpen_StillAsksAndStillReturnsTheTokens()
    {
        // Arrange — an employee signing in with nothing else open. Ending nothing is an ordinary
        // outcome, not a failure, and it must not change what sign-in returns.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var administrator = new StubSessionAdministrator { SessionsEnded = 0 };
        var resolver = CreateResolver(handler, out _, administrator: administrator);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Single(administrator.Calls);
        Assert.Equal("an-access-token", session.AccessToken);
        Assert.Equal("a-refresh-token", session.RefreshToken);
    }

    [Fact]
    public async Task ResolveAsync_WhenTheOtherSessionsCannotBeEnded_ReturnsNoSessionAtAll()
    {
        // Arrange — the credentials were good; ending the other sessions is what failed.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var administrator = new StubSessionAdministrator
        {
            Failure = () => new SessionTerminationFailedException("the connection failed"),
        };

        var resolver = CreateResolver(handler, out _, administrator: administrator);

        // Act / Assert — no tokens are handed back "anyway". A session returned here would be one
        // the store cannot say is the employee's only one, which is the whole promise.
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheTokenResponseCarriesNoRefreshToken_ThrowsProviderUnreachable()
    {
        // Arrange — a device with no refresh token can never discover a session ended elsewhere,
        // so half a grant is not a usable sign-in.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, """
                { "access_token": "an-access-token", "session_state": "a-session", "expires_in": 300 }
                """);

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheTokenResponseNamesNoSession_RefusesRatherThanGuessing()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, """
                { "access_token": "an-access-token", "refresh_token": "a-refresh-token", "expires_in": 300 }
                """);

        var administrator = new StubSessionAdministrator();
        var resolver = CreateResolver(handler, out _, administrator: administrator);

        // Act / Assert — with no session named, the new session cannot be told from the old ones.
        // Ending all of them would kill the sign-in that is happening; ending none would leave two
        // live sessions. Neither is guessed at.
        await Assert.ThrowsAsync<SessionTerminationFailedException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));

        Assert.Empty(administrator.Calls);
    }

    [Fact]
    public async Task ResolveAsync_WhenTheProviderOmitsTheSubjectClaim_ThrowsIdentityIncomplete()
    {
        // Arrange — without the realm's own id for this employee there is nobody to ask the Admin
        // API about.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, """
                {
                  "preferred_username": "100482",
                  "name": "Avery Brooks",
                  "store_role": "associate",
                  "department": "Grocery",
                  "job_function": "Register"
                }
                """);

        var administrator = new StubSessionAdministrator();
        var resolver = CreateResolver(handler, out _, administrator: administrator);

        // Act
        var failure = await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));

        // Assert — names the claim, so whoever fixes the realm knows what to fix.
        Assert.Contains("sub", failure.Message, StringComparison.Ordinal);
        Assert.Empty(administrator.Calls);
    }

    [Fact]
    public async Task ResolveAsync_OnSuccess_NeverLogsEitherToken()
    {
        // Arrange — tokens are held to the same rule as PINs: never in a log line, at any level.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var resolver = CreateResolver(handler, out var logger);

        // Act
        await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.NotEmpty(logger.Lines);
        Assert.False(logger.ContainsText("an-access-token"), "The access token appeared in a log line.");
        Assert.False(logger.ContainsText("a-refresh-token"), "The refresh token appeared in a log line.");
    }

    [Fact]
    public async Task ResolveAsync_WithUnrecognizedEmployeeId_ThrowsInvalidCredentials()
    {
        // Arrange — Keycloak answers, and its answer is "no".
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<InvalidEmployeeCredentialsException>(
            () => resolver.ResolveAsync("no-such-employee", Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WithWrongPinForRealEmployee_ThrowsTheSameRejectionAsAnUnknownEmployee()
    {
        // Arrange — Keycloak reports both cases the same way, and so must this resolver: the
        // response must never reveal which of the two fields was wrong.
        var wrongPin = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");

        var unknownEmployee = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");

        // Act
        var wrongPinFailure = await Assert.ThrowsAsync<InvalidEmployeeCredentialsException>(
            () => CreateResolver(wrongPin, out _).ResolveAsync(EmployeeId, "0000", CancellationToken.None));

        var unknownEmployeeFailure = await Assert.ThrowsAsync<InvalidEmployeeCredentialsException>(
            () => CreateResolver(unknownEmployee, out _).ResolveAsync("no-such-employee", Pin, CancellationToken.None));

        // Assert
        Assert.Equal(unknownEmployeeFailure.GetType(), wrongPinFailure.GetType());
        Assert.Equal(unknownEmployeeFailure.Message, wrongPinFailure.Message);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task ResolveAsync_WhenProviderRejectsTheCredentials_ThrowsInvalidCredentials(HttpStatusCode statusCode)
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(statusCode, """{ "error": "invalid_grant" }""");

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<InvalidEmployeeCredentialsException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheConnectionFails_ThrowsProviderUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .Throws(new HttpRequestException("Connection refused"));

        var resolver = CreateResolver(handler, out _);

        // Act / Assert — never the invalid-credentials rejection: nothing was checked at all.
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheProviderTimesOut_ThrowsProviderUnreachable()
    {
        // Arrange — how HttpClient surfaces its own timeout elapsing.
        var handler = new StubHttpMessageHandler()
            .Throws(new TaskCanceledException("The request timed out.", new TimeoutException()));

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.BadGateway)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.NotFound)]
    public async Task ResolveAsync_WhenTheProviderFailsRatherThanJudges_ThrowsProviderUnreachable(
        HttpStatusCode statusCode)
    {
        // Arrange
        var handler = new StubHttpMessageHandler().RespondWith(statusCode);

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheUserInfoCallFails_ThrowsProviderUnreachable()
    {
        // Arrange — the credentials were accepted, then the provider fell over mid-handshake.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.InternalServerError);

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheProviderReturnsMalformedJson_ThrowsProviderUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, "this is not json");

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheTokenResponseCarriesNoToken_ThrowsProviderUnreachable()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, """{ "expires_in": 300 }""");

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));
    }

    [Fact]
    public async Task ResolveAsync_WhenTheCallerCancels_ThrowsCancellationRatherThanUnreachable()
    {
        // Arrange — the caller giving up is not the provider being unreachable, and must not be
        // reported as a failed sign-in.
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();

        var handler = new StubHttpMessageHandler()
            .Throws(new OperationCanceledException(cancellation.Token));

        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, cancellation.Token));
    }

    [Theory]
    [InlineData("department")]
    [InlineData("job_function")]
    [InlineData("store_role")]
    public async Task ResolveAsync_WhenTheProviderOmitsARequiredClaim_ThrowsIdentityIncomplete(string omittedClaim)
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoWithout(omittedClaim));

        var resolver = CreateResolver(handler, out _);

        // Act
        var failure = await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));

        // Assert — names the claim, so whoever fixes the realm knows what to fix.
        Assert.Contains(omittedClaim, failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ResolveAsync_WithARoleTheStoreDoesNotRecognize_ThrowsIdentityIncomplete()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfo(role: "regional-director"));

        var resolver = CreateResolver(handler, out _);

        // Act / Assert — an unknown tier is refused, never quietly downgraded to Associate.
        var failure = await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));

        Assert.Contains("regional-director", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ResolveAsync_WhenAClaimIsAnArray_ReadsItsValue()
    {
        // Arrange — Keycloak renders a multi-valued user attribute as an array even for one value.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, """
                {
                  "sub": "d1b0a4f2-0000-0000-0000-000000000001",
                  "preferred_username": "100482",
                  "name": "Avery Brooks",
                  "store_role": ["store-manager"],
                  "department": ["Front End"],
                  "job_function": ["Register"]
                }
                """);

        var resolver = CreateResolver(handler, out _);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(EmployeeRole.StoreManager, session.Identity.Role);
        Assert.Equal("Front End", session.Identity.Department);
        Assert.Equal("Register", session.Identity.JobFunction);
    }

    [Fact]
    public async Task ResolveAsync_WhenTheProviderOmitsTheName_FallsBackToTheEmployeeId()
    {
        // Arrange — a display name has an obvious safe fallback, unlike role or department, so its
        // absence is cosmetic rather than a reason to refuse the sign-in.
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, """
                {
                  "sub": "d1b0a4f2-0000-0000-0000-000000000001",
                  "preferred_username": "100482",
                  "store_role": "associate",
                  "department": "Grocery",
                  "job_function": "Register"
                }
                """);

        var resolver = CreateResolver(handler, out _);

        // Act
        var session = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal("100482", session.Identity.Name);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task ResolveAsync_WithoutAnEmployeeId_ThrowsArgumentException(string? employeeId)
    {
        // Arrange
        var handler = new StubHttpMessageHandler();
        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => resolver.ResolveAsync(employeeId!, Pin, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task ResolveAsync_WithoutAPin_ThrowsArgumentException(string? pin)
    {
        // Arrange
        var handler = new StubHttpMessageHandler();
        var resolver = CreateResolver(handler, out _);

        // Act / Assert
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => resolver.ResolveAsync(EmployeeId, pin!, CancellationToken.None));

        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task ResolveAsync_OnSuccess_NeverLogsThePin()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var resolver = CreateResolver(handler, out var logger);

        // Act
        await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.NotEmpty(logger.Lines);
        Assert.False(logger.ContainsText(Pin), $"The PIN appeared in a log line: {string.Join(" | ", logger.Lines)}");
    }

    [Fact]
    public async Task ResolveAsync_OnRejection_NeverLogsThePin()
    {
        // Arrange — the failure path is the one that most invites logging "the PIN that was tried".
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");

        var resolver = CreateResolver(handler, out var logger);

        // Act
        await Assert.ThrowsAsync<InvalidEmployeeCredentialsException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));

        // Assert
        Assert.NotEmpty(logger.Lines);
        Assert.False(logger.ContainsText(Pin), $"The PIN appeared in a log line: {string.Join(" | ", logger.Lines)}");
    }

    [Fact]
    public async Task ResolveAsync_WhenTheProviderIsUnreachable_NeverLogsThePin()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .Throws(new HttpRequestException("Connection refused"));

        var resolver = CreateResolver(handler, out var logger);

        // Act
        await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
            () => resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None));

        // Assert
        Assert.NotEmpty(logger.Lines);
        Assert.False(logger.ContainsText(Pin), $"The PIN appeared in a log line: {string.Join(" | ", logger.Lines)}");
    }

    [Fact]
    public async Task ResolveAsync_OnAnyFailure_NeverPutsThePinInTheExceptionMessage()
    {
        // Arrange — an exception message reaches a log line by another route, so it is held to the
        // same rule as a log call.
        var rejection = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");

        var unreachable = new StubHttpMessageHandler()
            .Throws(new HttpRequestException("Connection refused"));

        var incomplete = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoWithout("department"));

        // Act
        var failures = new Exception[]
        {
            await Assert.ThrowsAsync<InvalidEmployeeCredentialsException>(
                () => CreateResolver(rejection, out _).ResolveAsync(EmployeeId, Pin, CancellationToken.None)),
            await Assert.ThrowsAsync<IdentityProviderUnreachableException>(
                () => CreateResolver(unreachable, out _).ResolveAsync(EmployeeId, Pin, CancellationToken.None)),
            await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
                () => CreateResolver(incomplete, out _).ResolveAsync(EmployeeId, Pin, CancellationToken.None)),
        };

        // Assert
        foreach (var failure in failures)
        {
            Assert.DoesNotContain(Pin, failure.ToString(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task ResolveAsync_WithATrailingSlashOnTheAuthority_StillBuildsUsableUrls()
    {
        // Arrange
        var handler = new StubHttpMessageHandler()
            .RespondWith(HttpStatusCode.OK, TokenResponse)
            .RespondWith(HttpStatusCode.OK, UserInfoResponse);

        var resolver = CreateResolver(handler, out _, authority: "https://keycloak.test/");

        // Act
        await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(
            "https://keycloak.test/realms/team-targe/protocol/openid-connect/token",
            handler.Requests[0].RequestUri?.ToString());
    }

    private static KeycloakEmployeeIdentityResolver CreateResolver(
        StubHttpMessageHandler handler,
        out CapturingLogger<KeycloakEmployeeIdentityResolver> logger,
        string authority = "https://keycloak.test",
        StubSessionAdministrator? administrator = null)
    {
        logger = new CapturingLogger<KeycloakEmployeeIdentityResolver>();

        var options = Options.Create(new KeycloakOptions
        {
            Authority = authority,
            Realm = "team-targe",
            ClientId = "team-targe-store",
            ClientSecret = "a-secret",
        });

        return new KeycloakEmployeeIdentityResolver(
            new HttpClient(handler),
            administrator ?? new StubSessionAdministrator(),
            options,
            logger);
    }

    private static string UserInfo(string role) => $$"""
        {
          "sub": "d1b0a4f2-0000-0000-0000-000000000001",
          "preferred_username": "100482",
          "name": "Avery Brooks",
          "store_role": "{{role}}",
          "department": "Grocery",
          "job_function": "Customer Support"
        }
        """;

    private static string UserInfoWithout(string omittedClaim)
    {
        var claims = new System.Collections.Generic.Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["store_role"] = "associate",
            ["department"] = "Grocery",
            ["job_function"] = "Register",
        };

        claims.Remove(omittedClaim);

        var rendered = string.Join(
            ",\n  ",
            System.Linq.Enumerable.Select(claims, claim => $"\"{claim.Key}\": \"{claim.Value}\""));

        return $"{{\n  \"sub\": \"{Subject}\",\n  \"preferred_username\": \"100482\",\n  \"name\": \"Avery Brooks\",\n  {rendered}\n}}";
    }

    /// <summary>
    /// Stands in for the Admin API side of sign-in, so these tests stay about what the resolver
    /// does with a grant rather than about how a session is ended.
    /// </summary>
    private sealed class StubSessionAdministrator : IKeycloakSessionAdministrator
    {
        /// <summary>Every request to end an employee's other sessions, in order.</summary>
        public List<TerminationCall> Calls { get; } = [];

        /// <summary>How many other sessions to report as ended.</summary>
        public int SessionsEnded { get; init; }

        /// <summary>What to throw instead of ending anything, if anything.</summary>
        public Func<Exception>? Failure { get; init; }

        /// <summary>
        /// Held open to keep a termination in flight, so a test can see whether sign-in waits for
        /// it or answers over the top of it.
        /// </summary>
        public Task? Gate { get; init; }

        public async Task<int> TerminateOtherSessionsAsync(
            string userId,
            string currentSessionId,
            CancellationToken cancellationToken)
        {
            Calls.Add(new TerminationCall(userId, currentSessionId));

            if (Failure is not null)
            {
                throw Failure();
            }

            if (Gate is not null)
            {
                await Gate;
            }

            return SessionsEnded;
        }

        internal sealed record TerminationCall(string UserId, string CurrentSessionId);
    }
}

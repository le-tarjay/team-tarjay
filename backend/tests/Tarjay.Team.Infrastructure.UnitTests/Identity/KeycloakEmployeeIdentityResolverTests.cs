using System;
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

    private const string TokenResponse = """
        { "access_token": "an-access-token", "expires_in": 300, "token_type": "Bearer" }
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
        var identity = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal("100482", identity.EmployeeId);
        Assert.Equal("Avery Brooks", identity.Name);
        Assert.Equal(EmployeeRole.DepartmentManager, identity.Role);
        Assert.Equal("Grocery", identity.Department);
        Assert.Equal("Customer Support", identity.JobFunction);
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
        var identity = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(expected, identity.Role);
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
                  "preferred_username": "100482",
                  "name": "Avery Brooks",
                  "store_role": ["store-manager"],
                  "department": ["Front End"],
                  "job_function": ["Register"]
                }
                """);

        var resolver = CreateResolver(handler, out _);

        // Act
        var identity = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal(EmployeeRole.StoreManager, identity.Role);
        Assert.Equal("Front End", identity.Department);
        Assert.Equal("Register", identity.JobFunction);
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
                  "preferred_username": "100482",
                  "store_role": "associate",
                  "department": "Grocery",
                  "job_function": "Register"
                }
                """);

        var resolver = CreateResolver(handler, out _);

        // Act
        var identity = await resolver.ResolveAsync(EmployeeId, Pin, CancellationToken.None);

        // Assert
        Assert.Equal("100482", identity.Name);
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
        string authority = "https://keycloak.test")
    {
        logger = new CapturingLogger<KeycloakEmployeeIdentityResolver>();

        var options = Options.Create(new KeycloakOptions
        {
            Authority = authority,
            Realm = "team-targe",
            ClientId = "team-targe-store",
            ClientSecret = "a-secret",
        });

        return new KeycloakEmployeeIdentityResolver(new HttpClient(handler), options, logger);
    }

    private static string UserInfo(string role) => $$"""
        {
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

        return $"{{\n  \"preferred_username\": \"100482\",\n  \"name\": \"Avery Brooks\",\n  {rendered}\n}}";
    }
}

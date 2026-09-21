using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Identity;

/// <summary>
/// What the API does with the bearer credential on a request, now that it requires one.
/// </summary>
/// <remarks>
/// The point of the epic, stated as a test: ending a session elsewhere has to stop that device
/// from acting, and it only does if the API actually checks the token rather than trusting the
/// frontend to stop sending one. Every case here runs through the app's real JWT bearer
/// registration — only the signing key is the test's rather than the realm's (see
/// <see cref="TestRealm"/>).
/// </remarks>
public class ProtectedEndpointTests
{
    private const string SignInUrl = "/v1/employees/sign-in";

    [Fact]
    public async Task ProtectedEndpoint_WithNoAuthorizationHeader_IsRefused()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — before this story the same request was served. That is what made a terminated
        // session cosmetic: the device kept working, it just stopped being told it was signed in.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithAValidToken_IsServed()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.ValidToken());

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithAValidToken_ProjectsTheRealmsThreeClaims()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(
            factory,
            TestRealm.ValidToken(role: "StoreManager", department: "Front End", jobFunction: "Register"));

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — the realm's protocol mappers put these on the token and stock JWT bearer puts
        // them on the principal. Nothing in this API parses a claim by hand, and this is what says
        // so: no code of ours sits between the token and these three values.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        Assert.NotNull(factory.Principal.Principal);
        Assert.True(factory.Principal.Principal!.Identity?.IsAuthenticated);
        Assert.Equal("StoreManager", factory.Principal.ClaimValue(TestRealm.RoleClaim));
        Assert.Equal("Front End", factory.Principal.ClaimValue(TestRealm.DepartmentClaim));
        Assert.Equal("Register", factory.Principal.ClaimValue(TestRealm.JobFunctionClaim));
    }

    [Fact]
    public async Task ProtectedEndpoint_WithAnExpiredToken_IsRefused()
    {
        // Arrange — signed by the realm, naming the realm, and good in every way but one.
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.ExpiredToken());

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_AnExpiredTokenAndAMissingOne_AreDistinguishableOnTheWire()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var expiredClient = Authenticated(factory, TestRealm.ExpiredToken());
        using var anonymousClient = factory.CreateClient();

        // Act
        using var expired = await expiredClient.GetAsync(TestRoutes.ProtectedUrl);
        using var missing = await anonymousClient.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — both are 401, deliberately: a caller learns nothing from the status about which
        // it was. The challenge header still separates them, which is what lets the frontend tell
        // "your session ran out" from "you never had one" without a second round trip.
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);

        Assert.Contains(
            "invalid_token",
            expired.Headers.WwwAuthenticate.ToString(),
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "invalid_token",
            missing.Headers.WwwAuthenticate.ToString(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithARejectedToken_DoesNotNarrateWhyInTheChallenge()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.ExpiredToken());

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — `error` stays, because a client acts on it: invalid_token means re-authenticate
        // rather than prompt. `error_description` goes, because it is IdentityModel's diagnostic
        // — the exact expiry instant, the issuer, the key id — handed to a caller who by
        // definition has not authenticated and can do nothing with it.
        var challenge = response.Headers.WwwAuthenticate.ToString();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("error=\"invalid_token\"", challenge, StringComparison.Ordinal);
        Assert.DoesNotContain("error_description", challenge, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ProtectedEndpoint_WhenTheRealmCannotBeReached_IsUnavailableRatherThanRefused()
    {
        // Arrange — a Keycloak that is down or misconfigured. The credential is a good one; the
        // API simply cannot fetch the keys it would be checked against.
        using var factory = new UnreachableRealmFactory();
        using var client = Authenticated(factory, TestRealm.ValidToken());

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — 503, not 401 and not 500. 401 would tell a caller to re-authenticate against
        // the very realm that is down, and a device with a perfectly good token would sign its
        // employee out over an outage. 500 would blame the request. This is retry-and-wait, and
        // the status is the only part of that a client actually reads.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithATokenSignedByAnUnpublishedKey_IsRefused()
    {
        // Arrange — the shape of a forged token: everything right except that the realm's
        // published keys do not verify the signature.
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.TokenSignedByAnotherKey());

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithATokenFromAnotherRealm_IsRefused()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.TokenFromAnotherRealm());

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — a second Keycloak, or a second realm on the same one, is not this store's
        // authority. Its signature and its issuer are both wrong here.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithAnUnauthenticatedRequest_NeverReachesTheAction()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.GetAsync(TestRoutes.ProtectedUrl);

        // Assert — refused at the pipeline, not inside the endpoint. An action that runs and then
        // declines to answer has already done whatever work it does.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Null(factory.Principal.Principal);
    }

    [Fact]
    public async Task SignIn_WithNoToken_StillSucceeds()
    {
        // Arrange — the endpoint a token comes from cannot be the one that demands a token.
        // The sign-in factory is the one that stubs Keycloak, so this is a real 200 rather than a
        // "at least it was not a 401" from an unreachable realm.
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = "8321" });

        // Assert — past authorization and all the way into the action.
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Single(factory.Resolver.Calls);
    }

    [Fact]
    public async Task SignIn_WithAnExpiredToken_IsNotRefusedByItsPresence()
    {
        // Arrange — a device whose session ended still has a stale token in hand, and the first
        // thing it does is sign in again. An anonymous endpoint that authenticated opportunistically
        // would reject that request on the strength of a credential it was never going to read.
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", TestRealm.ExpiredToken());

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = "8321" });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static HttpClient Authenticated(ApiWebApplicationFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return client;
    }
}

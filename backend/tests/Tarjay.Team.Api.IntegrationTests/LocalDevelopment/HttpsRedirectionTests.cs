using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.LocalDevelopment;

/// <summary>
/// Whether a plain-HTTP request is served or upgraded, which differs by environment on purpose.
/// </summary>
/// <remarks>
/// Both tests here run with an HTTPS port configured (see <see cref="LocalBrowserAccessFactory"/>),
/// because <c>UseHttpsRedirection</c> does nothing at all without one. The pair is the point: the
/// same request under two environments, one served and one redirected. Without the redirected half
/// the served half would prove nothing, since it would pass equally if the middleware had simply
/// failed to find a port.
/// </remarks>
public class HttpsRedirectionTests
{
    private const string SignInUrl = "/v1/employees/sign-in";
    private const string Pin = "8321";

    [Fact]
    public async Task SignIn_OverPlainHttpInDevelopment_IsServedRatherThanRedirected()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        using var client = factory.CreateClient(NoRedirects());

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — locally the frontend is plain HTTP too, and a browser will not follow a
        // redirect to an untrusted local certificate. Redirecting here does not upgrade the
        // request, it loses it.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task SignIn_OverPlainHttpOutsideDevelopment_IsStillRedirected()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.OutsideDevelopment();
        using var client = factory.CreateClient(NoRedirects());

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — the local affordance is scoped, so a deployed environment still upgrades. This
        // is also what proves the sibling test above is not vacuous: the middleware demonstrably
        // can redirect with this configuration, and in development it demonstrably does not.
        Assert.Equal(HttpStatusCode.TemporaryRedirect, response.StatusCode);
        Assert.Equal(
            $"https://localhost:{LocalBrowserAccessFactory.HttpsPort}{SignInUrl}",
            response.Headers.Location?.ToString());
    }

    // The redirect is what is being observed, so it must not be followed.
    private static WebApplicationFactoryClientOptions NoRedirects() =>
        new() { AllowAutoRedirect = false };
}

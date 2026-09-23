using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Testing;
using Tarjay.Team.Domain.Identity;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.LocalDevelopment;

/// <summary>
/// What a browser on the Angular dev server's origin can and cannot read back from this API.
/// </summary>
public class BrowserCorsTests
{
    private const string SignInUrl = "/v1/employees/sign-in";
    private const string Pin = "8321";
    private const string DevServerOrigin = "http://localhost:4200";
    private const string AllowOrigin = "Access-Control-Allow-Origin";

    [Fact]
    public async Task SignIn_FromTheDevServerOrigin_CarriesTheHeaderThatLetsTheBrowserReadIt()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", DevServerOrigin);

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — without this header the browser discards a response the server did send.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(DevServerOrigin, Single(response, AllowOrigin));
    }

    [Fact]
    public async Task Preflight_ForTheSignInRoute_IsAnsweredWithoutReachingTheAction()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        using var client = factory.CreateClient();

        using var preflight = new HttpRequestMessage(HttpMethod.Options, SignInUrl);
        preflight.Headers.Add("Origin", DevServerOrigin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type");

        // Act
        using var response = await client.SendAsync(preflight);

        // Assert — the browser asks permission before it will send the real POST, and the answer
        // has to name both the method and the Content-Type header the real POST will carry.
        Assert.Equal(DevServerOrigin, Single(response, AllowOrigin));
        Assert.Contains(
            "POST",
            Single(response, "Access-Control-Allow-Methods"),
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains(
            "content-type",
            Single(response, "Access-Control-Allow-Headers"),
            StringComparison.OrdinalIgnoreCase);

        // The preflight is not a sign-in attempt. It carries no credentials, so it must not reach
        // the identity provider — and it must not be answered by the validation filter either,
        // which would reject the empty body as a 422 and read to the browser as a denied preflight.
        Assert.Empty(factory.Resolver.Calls);
        Assert.NotEqual(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }

    [Fact]
    public async Task Preflight_ForAProtectedRoute_IsNotBlockedByTheAuthMiddleware()
    {
        // Arrange — a browser will not attach an Authorization header to a preflight, by spec. So
        // the preflight for every authenticated request the frontend makes arrives with no
        // credential at all, and has to be answered anyway.
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        using var client = factory.CreateClient();

        using var preflight = new HttpRequestMessage(HttpMethod.Options, TestRoutes.ProtectedUrl);
        preflight.Headers.Add("Origin", DevServerOrigin);
        preflight.Headers.Add("Access-Control-Request-Method", "GET");
        preflight.Headers.Add("Access-Control-Request-Headers", "authorization");

        // Act
        using var response = await client.SendAsync(preflight);

        // Assert — a 401 here would read to the browser as a denied preflight, and the real
        // request that would have carried the token never gets sent. The CORS middleware sits
        // upstream of authentication precisely so this is answered before anything asks for one.
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(DevServerOrigin, Single(response, AllowOrigin));
        Assert.Contains(
            "authorization",
            Single(response, "Access-Control-Allow-Headers"),
            StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task SignIn_OnAHandledFailure_StillCarriesTheCorsHeader(HttpStatusCode expected)
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        factory.Resolver.Behavior = (_, _) => throw (Exception)(expected switch
        {
            HttpStatusCode.Unauthorized => new InvalidEmployeeCredentialsException(),
            HttpStatusCode.ServiceUnavailable => new IdentityProviderUnreachableException("the connection failed"),
            _ => new EmployeeIdentityIncompleteException("no department claim was supplied"),
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", DevServerOrigin);

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = "0000" });

        // Assert — this is the defect this epic exists to remove. These responses are written by
        // the exception handler, which sits upstream of the CORS middleware; if the headers were
        // lost there, the browser would report a CORS failure and the frontend's 401 and 503
        // messages would collapse back into one generic "something went wrong".
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(DevServerOrigin, Single(response, AllowOrigin));
    }

    [Fact]
    public async Task SignIn_OnAnUnexpectedFailure_StillCarriesTheCorsHeader()
    {
        // Arrange — the fallback handler returns a bare status with no body at all, so the headers
        // are the only thing on the response for the browser to go on.
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        factory.Resolver.Behavior = (_, _) => throw new InvalidOperationException("something nobody anticipated");

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", DevServerOrigin);

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Equal(DevServerOrigin, Single(response, AllowOrigin));
    }

    [Fact]
    public async Task SignIn_WhenValidationRejectsTheRequest_StillCarriesTheCorsHeader()
    {
        // Arrange — the validation filter short-circuits before the action, which is a second,
        // separate way a response can be produced without the controller ever running.
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", DevServerOrigin);

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(DevServerOrigin, Single(response, AllowOrigin));
    }

    [Fact]
    public async Task SignIn_FromAnOriginThePolicyDoesNotName_DoesNotGetThePermissiveHeader()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.InDevelopment();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://malicious.example");

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — the server still answers; CORS is enforced by the browser, not here. What the
        // policy withholds is the header that would let that browser read the answer.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains(AllowOrigin));
    }

    [Fact]
    public async Task SignIn_OutsideDevelopment_DoesNotGetThePermissiveHeader()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.OutsideDevelopment();
        using var client = factory.CreateClient(OverHttps());
        client.DefaultRequestHeaders.Add("Origin", DevServerOrigin);

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — a local convenience must not follow the app into a deployed environment. The
        // request is served, so this is genuinely the policy withholding the header rather than
        // the response never reaching the endpoint.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains(AllowOrigin));
    }

    [Fact]
    public async Task Preflight_OutsideDevelopment_IsNotAnsweredByAnyPolicy()
    {
        // Arrange
        using var factory = LocalBrowserAccessFactory.OutsideDevelopment();
        using var client = factory.CreateClient(OverHttps());

        using var preflight = new HttpRequestMessage(HttpMethod.Options, SignInUrl);
        preflight.Headers.Add("Origin", DevServerOrigin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");

        // Act
        using var response = await client.SendAsync(preflight);

        // Assert — with no CORS middleware in the pipeline nothing short-circuits the preflight,
        // so it falls all the way through to routing and is refused like any other method the
        // route does not map. That refusal is the proof no policy claimed it.
        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
        Assert.False(response.Headers.Contains(AllowOrigin));
    }

    // Outside development the HTTPS redirect is in the pipeline. Asking over HTTPS keeps it from
    // short-circuiting the request, so a CORS assertion is measuring the CORS policy rather than
    // passing because a 307 came back before anything reached the endpoint. Redirect-following is
    // off regardless, so nothing silently chases a second request.
    private static WebApplicationFactoryClientOptions OverHttps() =>
        new() { BaseAddress = new Uri("https://localhost/"), AllowAutoRedirect = false };

    // Asserts the header is present exactly once and returns it. A CORS header duplicated by two
    // middlewares is itself a failure — a browser rejects a repeated Access-Control-Allow-Origin.
    private static string Single(HttpResponseMessage response, string header)
    {
        Assert.True(
            response.Headers.TryGetValues(header, out IEnumerable<string>? values),
            $"The response carried no {header} header.");

        return Assert.Single(values!);
    }
}

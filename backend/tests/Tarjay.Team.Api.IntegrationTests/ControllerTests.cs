using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests;

public class ControllerTests : IClassFixture<ApiWebApplicationFactory>
{
    private readonly ApiWebApplicationFactory _factory;

    public ControllerTests(ApiWebApplicationFactory factory)
    {
        ArgumentNullException.ThrowIfNull(factory);
        _factory = factory;
    }

    [Fact]
    public async Task GetWeatherForecast()
    {
        // The endpoint is behind [Authorize] now, so a caller brings a credential. This test used
        // to send none and pass; that it would now fail unchanged is the change working, and the
        // no-token case it used to cover by accident is asserted deliberately below.
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", TestRealm.ValidToken());

        using var response = await client.GetAsync("/weatherforecast");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task GetWeatherForecast_WithoutACredential_IsRefused()
    {
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync("/weatherforecast");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}

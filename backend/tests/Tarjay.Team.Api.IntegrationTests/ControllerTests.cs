using System;
using System.Net.Http;
using System.Threading.Tasks;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests;

public class ControllerTests : IClassFixture<ApiWebApplicationFactory>
{
  private readonly HttpClient _client;

  public ControllerTests(ApiWebApplicationFactory factory)
  {
    ArgumentNullException.ThrowIfNull(factory);
    _client = factory.CreateClient();
  }
  
  [Fact]
  public async Task GetWeatherForecast()
  {
    var response = await _client.GetAsync("/weatherforecast");
    response.EnsureSuccessStatusCode();
  }
}
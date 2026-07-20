using System;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.VisualStudio.TestPlatform.TestHost;

namespace Tarjay.Team.Api.IntegrationTests;

public class ApiWebApplicationFactory : WebApplicationFactory<Program>
{
  public ApiWebApplicationFactory()
  {
    // Same local-development posture as deploy/docker-compose.yml: authentication is still
    // required (a bearer token must be present), signature verification is skipped.
    Environment.SetEnvironmentVariable("XXXX", "false");
  }
  
  protected override void ConfigureWebHost(IWebHostBuilder builder)
  {
    ArgumentNullException.ThrowIfNull(builder);

    builder.UseEnvironment("Development");

    builder.ConfigureTestServices(services =>
    {
      // Pin OIDC discovery to a static, empty document so no test ever reaches the network,
      // regardless of the (unreachable, placeholder) Identity:Authority in appsettings.
      services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
      {
        var emptyConfiguration = new OpenIdConnectConfiguration();
        options.Configuration = emptyConfiguration;
        options.ConfigurationManager =
          new StaticConfigurationManager<OpenIdConnectConfiguration>(emptyConfiguration);
      });
    });
  }
}
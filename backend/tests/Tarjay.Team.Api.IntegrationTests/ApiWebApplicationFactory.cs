using System;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace Tarjay.Team.Api.IntegrationTests;

// The type argument is Tarjay.Team.Api.Program — the application's own entry point, resolved
// through this namespace's parent. It is deliberately not the test platform's own Program class;
// naming that one instead points the factory at the test host rather than the app, which fails at
// run time looking for a deps file the app never produced.
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

using System;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Tarjay.Team.Api.IntegrationTests;

// The type argument is Tarjay.Team.Api.Program — the application's own entry point, resolved
// through this namespace's parent. It is deliberately not the test platform's own Program class;
// naming that one instead points the factory at the test host rather than the app, which fails at
// run time looking for a deps file the app never produced.
public class ApiWebApplicationFactory : WebApplicationFactory<Program>
{
    /// <summary>The principal the app authenticated on the most recent request.</summary>
    public PrincipalCapture Principal { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseEnvironment("Development");

        builder.ConfigureTestServices(services =>
        {
            // Pin OIDC discovery to a static document so no test ever reaches the network,
            // regardless of the (unreachable, placeholder) Identity:Authority in appsettings.
            // The document is no longer empty: the app now validates bearer tokens for real, so
            // it has to publish a key those tokens can be signed with. Everything else about the
            // app's JWT bearer configuration is left exactly as Program.cs registered it — see
            // TestRealm, which owns the key and mints the tokens.
            TestRealm.PinDiscoveryToTestRealm(services);

            services.AddSingleton<IClaimsTransformation>(Principal);
        });
    }
}

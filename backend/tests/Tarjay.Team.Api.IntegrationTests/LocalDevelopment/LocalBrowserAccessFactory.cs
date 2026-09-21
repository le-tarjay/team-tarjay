using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Tarjay.Team.Api.IntegrationTests.Identity;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.IntegrationTests.LocalDevelopment;

/// <summary>
/// Hosts the real app the way a browser meets it, with the hosting environment and the
/// discoverable HTTPS port both under the test's control.
/// </summary>
/// <remarks>
/// <para>
/// The environment is the subject here rather than the setup. Both the CORS policy and the HTTPS
/// redirect are scoped to development, and the only way to show a scoping is to run the same
/// request under two environments and compare — so this factory takes the environment name
/// instead of pinning it to <c>Development</c> the way the sign-in factory does.
/// </para>
/// <para>
/// The HTTPS port is set for a related reason. <c>UseHttpsRedirection</c> silently passes the
/// request through when it cannot discover a port to redirect to, so a test that left the port
/// undiscoverable would pass whether the middleware were skipped or not. Setting
/// <c>HTTPS_PORT</c> makes the redirect real, which is what gives "it was not redirected"
/// something to fail against.
/// </para>
/// <para>
/// Keycloak is stubbed out, and only Keycloak — the pipeline under test is the real one, which is
/// the whole point of asserting on middleware from here.
/// </para>
/// </remarks>
public sealed class LocalBrowserAccessFactory(string environmentName) : WebApplicationFactory<Program>
{
    /// <summary>A port that is never listened on; it only has to be discoverable, not reachable.</summary>
    public const string HttpsPort = "8443";

    /// <summary>An HTTPS realm URL for the environments that insist on one. Never actually fetched.</summary>
    private const string HttpsRealmAuthority = "https://identity.invalid:8443";

    /// <summary>The stubbed identity provider, so a test can choose the status the API returns.</summary>
    public StubEmployeeIdentityResolver Resolver { get; } = new();

    /// <summary>The principal the app authenticated on the most recent request.</summary>
    public PrincipalCapture Principal { get; } = new();

    /// <summary>The app as a developer runs it locally.</summary>
    public static LocalBrowserAccessFactory InDevelopment() => new(Environments.Development);

    /// <summary>The app as a deployed environment runs it, where neither local affordance applies.</summary>
    public static LocalBrowserAccessFactory OutsideDevelopment() => new(Environments.Production);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseEnvironment(environmentName);

        // See the remarks: this is what makes UseHttpsRedirection actually redirect.
        builder.UseSetting("HTTPS_PORT", HttpsPort);

        // Outside development the app refuses to fetch realm metadata over plain HTTP, and
        // appsettings.json names a plain-HTTP realm because that is what runs locally. So the
        // deployed-environment half of these tests is given the HTTPS realm URL a deployed
        // environment would have. This configures the app rather than relaxing it: the rule under
        // test stays on, and it is satisfied the way a real deployment satisfies it. Nothing is
        // ever fetched from this URL — discovery is pinned below.
        if (!string.Equals(environmentName, Environments.Development, StringComparison.Ordinal))
        {
            builder.ConfigureAppConfiguration(configuration => configuration.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Identity:Authority"] = HttpsRealmAuthority }));
        }

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IEmployeeIdentityResolver>();
            services.AddSingleton<IEmployeeIdentityResolver>(Resolver);

            TestRealm.PinDiscoveryToTestRealm(services);

            services.AddSingleton<IClaimsTransformation>(Principal);
        });
    }
}

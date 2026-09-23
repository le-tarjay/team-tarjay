using System;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;

namespace Tarjay.Team.Api.IntegrationTests.Identity;

/// <summary>
/// The app with its realm down: discovery cannot be fetched, so no token can be validated.
/// </summary>
/// <remarks>
/// Derived from <see cref="ApiWebApplicationFactory"/> rather than written alongside it, so the
/// only difference from every other test here is the one under test. The base pins discovery to
/// <see cref="TestRealm"/>; this re-pins it afterwards, and post-configuration runs in
/// registration order, so the unreachable document is the one the handler ends up with.
/// </remarks>
public sealed class UnreachableRealmFactory : ApiWebApplicationFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(TestRealm.PinDiscoveryToAnUnreachableRealm);
    }
}

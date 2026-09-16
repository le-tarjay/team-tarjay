using System;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers employee identity resolution against Keycloak.
/// </summary>
internal static class EmployeeIdentityServiceCollectionExtensions
{
    /// <summary>
    /// Binds the <c>Identity</c> configuration section and registers the Keycloak-backed resolver
    /// behind <see cref="IEmployeeIdentityResolver"/>.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <param name="configuration">Configuration to bind the identity options from.</param>
    /// <returns>The same service collection, for chaining.</returns>
    public static IServiceCollection AddEmployeeIdentity(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.Configure<KeycloakOptions>(configuration.GetSection(KeycloakOptions.SectionName));

        // Registered against the interface, and with DI owning the HttpClient's lifetime rather
        // than a hand-rolled singleton holding one forever.
        services.AddHttpClient<IEmployeeIdentityResolver, KeycloakEmployeeIdentityResolver>(
            static (serviceProvider, httpClient) =>
            {
                var options = serviceProvider.GetRequiredService<IOptions<KeycloakOptions>>().Value;
                httpClient.Timeout = options.Timeout;
            });

        return services;
    }
}

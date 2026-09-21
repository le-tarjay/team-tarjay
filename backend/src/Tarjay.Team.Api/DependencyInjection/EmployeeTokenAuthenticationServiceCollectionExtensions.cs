using System;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers validation of the employee access tokens Keycloak issues at sign-in.
/// </summary>
/// <remarks>
/// Stock JWT bearer authentication against the realm, not a mechanism of this application's own.
/// The realm signs the token and this validates that signature, the issuer, and the expiry — the
/// store mints no session artifact and holds no signing key.
/// </remarks>
internal static class EmployeeTokenAuthenticationServiceCollectionExtensions
{
    /// <summary>
    /// Adds JWT bearer authentication pointed at the realm named by the <c>Identity</c>
    /// configuration section, plus the authorization services <c>[Authorize]</c> runs on.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <param name="configuration">Configuration to bind the realm's location from.</param>
    /// <returns>The same service collection, for chaining.</returns>
    public static IServiceCollection AddEmployeeTokenAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        // The same section AddEmployeeIdentity binds. Bound again here rather than relying on
        // that call having happened first, so this concern stands up on its own; binding one
        // section twice yields the same values.
        services.Configure<KeycloakOptions>(configuration.GetSection(KeycloakOptions.SectionName));

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();

        // Configured from resolved options rather than from IConfiguration read at this line.
        // That is not a style preference: this method runs while the application is still being
        // built, and reading a value here freezes whatever the configuration happened to hold at
        // that moment. Deferring it means the realm's location is read once every source is in
        // place — which is also what lets a test host point this at a different realm.
        services
            .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<KeycloakOptions>, IHostEnvironment>((options, identity, environment) =>
            {
                var realmAuthority = RealmAuthority(identity.Value);

                options.Authority = realmAuthority;

                // Locally the realm is plain HTTP — both on a developer's machine and inside the
                // compose network — so metadata could not be fetched at all with this on. It is
                // scoped to development exactly as the CORS policy and the HTTPS redirect are, so
                // a deployed environment still refuses to fetch signing keys over plaintext, and
                // has to be given an HTTPS realm.
                options.RequireHttpsMetadata = !environment.IsDevelopment();

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    // Signature and expiry, which is the whole of what this checks. Nothing here
                    // asks Keycloak whether the session behind the token is still alive: a
                    // terminated session is discovered by the refresh that follows failing, not
                    // by an access token being rejected mid-life.
                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,

                    // A token from another realm is signed by another realm's key and names
                    // another issuer, so this and the signature check together reject it.
                    ValidateIssuer = true,
                    ValidIssuer = realmAuthority,

                    // Off deliberately, and it is not an oversight. The committed realm puts no
                    // client-specific audience on an employee's access token — `aud` is
                    // Keycloak's stock `account` for every client in the realm — so validating it
                    // would either reject every real sign-in token or accept every client's
                    // equally. Making the audience discriminate by client needs an audience
                    // protocol mapper on `team-targe-store`, which lives in the realm export.
                    ValidateAudience = false,

                    // No grace period. The realm's access-token lifespan is 300 seconds and this
                    // epic exists to bound how long a device keeps acting after its session ends;
                    // the default five-minute skew would silently double that window.
                    ClockSkew = TimeSpan.Zero,
                };
            });

        services.AddAuthorization();

        return services;
    }

    // Keycloak issues tokens under the realm's own URL, not the server's, and names that same URL
    // as the issuer — so one string is both where the signing keys are discovered and what the
    // `iss` claim must equal.
    private static string RealmAuthority(KeycloakOptions identity) =>
        $"{identity.Authority.TrimEnd('/')}/realms/{identity.Realm}";
}

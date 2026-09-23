using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
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
    // Set while authenticating, read while challenging — the two events are the only place the
    // handler lets us tell "the realm did not answer" apart from "the credential was bad" by the
    // time a status code is being chosen.
    private const string RealmUnreachable = "Identity:RealmUnreachable";

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

                // Off, so a claim arrives on the principal under the name the realm put on the
                // token. Left on, the inbound mapper rewrites `sub` to the long
                // ClaimTypes.NameIdentifier URI and leaves `preferred_username` alone, so the two
                // claims that identify an employee arrive under two unrelated naming schemes. The
                // set of mappings is a static framework dictionary that can change under an
                // upgrade; nothing here should depend on its contents.
                options.MapInboundClaims = false;

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    // Who is calling. The realm's users are the employee IDs themselves, so
                    // `preferred_username` is the Employee ID and is what matches
                    // EmployeeIdentity.EmployeeId — the same claim the sign-in resolver reads it
                    // from. Naming it here makes User.Identity.Name that value, so an endpoint
                    // reads its caller with one obvious call rather than hunting for a claim.
                    //
                    // `sub` is deliberately not this. It is the realm's own GUID for the user,
                    // which the Admin API answers to and the store's attendance and schedule data
                    // is not keyed on.
                    NameClaimType = "preferred_username",

                    // RoleClaimType is deliberately left unset. Setting it would make `store_role`
                    // drive [Authorize(Roles = …)], and no endpoint gates on a role yet. That
                    // belongs to the epic that introduces the first one, along with the tests that
                    // prove which roles each endpoint admits.

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

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        // Two unrelated failures arrive here. One is the caller's: a token that
                        // is expired, forged or from another realm, which is a 401 and is what
                        // the rest of this registration is about. The other is ours: the realm's
                        // discovery document could not be fetched, so nothing could be validated
                        // at all. Left alone the handler rethrows that one and it leaves as a
                        // 500, which tells a caller its request was bad when in fact this API
                        // cannot presently answer. 503 says the right thing, and says it in the
                        // one way a client can act on: retry, do not re-authenticate.
                        //
                        // The discriminator is the exception type. Everything the token
                        // validator rejects a credential for derives from SecurityTokenException;
                        // a configuration fetch that fails does not — IdentityModel raises
                        // InvalidOperationException (IDX20803), wrapping whatever the transport
                        // threw.
                        if (context.Exception is not SecurityTokenException)
                        {
                            context.HttpContext.Items[RealmUnreachable] = true;

                            // Hands the handler a result so it returns instead of rethrowing.
                            // The status code is set in OnChallenge, which runs after this and
                            // would otherwise overwrite anything set here with its own 401.
                            context.Fail(context.Exception);
                        }

                        return Task.CompletedTask;
                    },

                    OnChallenge = context =>
                    {
                        if (context.HttpContext.Items.ContainsKey(RealmUnreachable))
                        {
                            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;

                            // Suppresses the 401 challenge the handler would otherwise write.
                            context.HandleResponse();

                            return Task.CompletedTask;
                        }

                        // `error` stays: it is the one bit that separates "your token was
                        // rejected" from "you sent none", which is what lets a client re-auth
                        // rather than prompt, and it is asserted as such. `error_description` is
                        // dropped, because it is IdentityModel's internal diagnostic — exact
                        // expiry instants, issuer strings, key ids — narrated to an unauthenticated
                        // caller. A client cannot act on any of it; the logs already carry it.
                        context.ErrorDescription = null;

                        return Task.CompletedTask;
                    },
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

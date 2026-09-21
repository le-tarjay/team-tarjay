using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Tarjay.Team.Api.IntegrationTests;

/// <summary>
/// A stand-in realm: a signing key these tests hold, and the discovery document the app's own JWT
/// bearer configuration reads it from.
/// </summary>
/// <remarks>
/// <para>
/// This replaces the key material and nothing else. The app's real <c>AddJwtBearer</c>
/// registration — its issuer, its lifetime check, its disabled audience check, its zero clock
/// skew — is the one under test here; only where the signing keys come from is swapped, because
/// the alternative is a test that reaches Keycloak over the network. Pinning discovery to a static
/// document is what the factory already did before tokens existed; the document simply carries a
/// key now instead of being empty.
/// </para>
/// <para>
/// <see cref="Issuer"/> is deliberately the exact string <c>appsettings.json</c> produces, so the
/// app's configured <c>ValidIssuer</c> is genuinely what accepts these tokens. A test that wants a
/// token the app must reject asks for one from <see cref="AnotherRealmIssuer"/> or signed by
/// <see cref="TokenSignedByAnotherKey"/>.
/// </para>
/// </remarks>
public static class TestRealm
{
    /// <summary>What <c>Identity:Authority</c> plus <c>Identity:Realm</c> resolve to in appsettings.</summary>
    public const string Issuer = "http://localhost:8080/realms/team-targe";

    /// <summary>A realm this API is not configured against, for the wrong-realm case.</summary>
    public const string AnotherRealmIssuer = "http://localhost:8080/realms/somebody-elses-realm";

    /// <summary>The role claim the realm's <c>store role</c> protocol mapper projects.</summary>
    public const string RoleClaim = "store_role";

    /// <summary>The claim the realm's <c>department</c> protocol mapper projects.</summary>
    public const string DepartmentClaim = "department";

    /// <summary>The claim the realm's <c>job function</c> protocol mapper projects.</summary>
    public const string JobFunctionClaim = "job_function";

    private static readonly RsaSecurityKey s_signingKey =
        new(RSA.Create(2048)) { KeyId = "test-realm-signing-key" };

    // A key the app never learns about, so a token signed with it fails for the one reason the
    // test is about: nothing in the realm's published keys verifies that signature.
    private static readonly RsaSecurityKey s_foreignKey =
        new(RSA.Create(2048)) { KeyId = "a-key-this-realm-never-published" };

    /// <summary>
    /// Points the app's JWT bearer options at this realm's key instead of the network.
    /// </summary>
    /// <param name="services">The test service collection to post-configure through.</param>
    public static void PinDiscoveryToTestRealm(IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            var configuration = new OpenIdConnectConfiguration { Issuer = Issuer };
            configuration.SigningKeys.Add(s_signingKey);

            options.Configuration = configuration;
            options.ConfigurationManager =
                new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
        });
    }

    /// <summary>
    /// A token the app should accept, carrying the three claims the realm's protocol mappers put
    /// on a real employee's access token.
    /// </summary>
    /// <param name="role">The <c>store_role</c> claim value.</param>
    /// <param name="department">The <c>department</c> claim value.</param>
    /// <param name="jobFunction">The <c>job_function</c> claim value.</param>
    /// <returns>A signed, unexpired JWT.</returns>
    public static string ValidToken(
        string role = "DepartmentManager",
        string department = "Grocery",
        string jobFunction = "Customer Support") =>
        Token(
            issuer: Issuer,
            key: s_signingKey,
            expires: DateTime.UtcNow.AddMinutes(5),
            role: role,
            department: department,
            jobFunction: jobFunction);

    /// <summary>A token this realm signed that has since run out. Everything else about it is good.</summary>
    /// <returns>A signed JWT whose lifetime has already ended.</returns>
    public static string ExpiredToken() =>
        Token(issuer: Issuer, key: s_signingKey, expires: DateTime.UtcNow.AddMinutes(-5));

    /// <summary>A well-formed token signed by a key the realm never published.</summary>
    /// <returns>A signed JWT whose signature nothing in the realm verifies.</returns>
    public static string TokenSignedByAnotherKey() =>
        Token(issuer: Issuer, key: s_foreignKey, expires: DateTime.UtcNow.AddMinutes(5));

    /// <summary>A token naming a different realm as its issuer.</summary>
    /// <returns>A signed JWT from an issuer this API is not configured against.</returns>
    public static string TokenFromAnotherRealm() =>
        Token(issuer: AnotherRealmIssuer, key: s_foreignKey, expires: DateTime.UtcNow.AddMinutes(5));

    private static string Token(
        string issuer,
        SecurityKey key,
        DateTime expires,
        string role = "Associate",
        string department = "Grocery",
        string jobFunction = "Register")
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer,
            IssuedAt = DateTime.UtcNow.AddMinutes(-10),
            NotBefore = DateTime.UtcNow.AddMinutes(-10),
            Expires = expires,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = "100482",
                ["preferred_username"] = "100482",
                ["azp"] = "team-targe-store",
                [RoleClaim] = role,
                [DepartmentClaim] = department,
                [JobFunctionClaim] = jobFunction,
            },
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256),
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}

/// <summary>
/// Records the <see cref="ClaimsPrincipal"/> the app ends up with, so a test can assert on what
/// the token actually projected.
/// </summary>
/// <remarks>
/// A claims transformation rather than a test-only endpoint: the app has no endpoint that echoes
/// the caller back, and adding one to production code so a test can read it would be inventing
/// surface area the story does not ask for. Authentication runs transformations against the
/// principal it just built, which is exactly the object under assertion.
/// </remarks>
public sealed class PrincipalCapture : IClaimsTransformation
{
    /// <summary>The principal from the most recent authenticated request, or null if none was.</summary>
    public ClaimsPrincipal? Principal { get; private set; }

    /// <summary>The value of <paramref name="claimType"/> on the captured principal.</summary>
    /// <param name="claimType">The claim to read.</param>
    /// <returns>The claim's value, or null if the principal does not carry it.</returns>
    public string? ClaimValue(string claimType) => Principal?.FindFirst(claimType)?.Value;

    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        Principal = principal;

        return Task.FromResult(principal);
    }
}

using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;

namespace Tarjay.Team.Api.IntegrationTests;

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

    /// <summary>
    /// The calling employee, as an endpoint reading <c>User.Identity.Name</c> would get it.
    /// </summary>
    /// <remarks>
    /// This is the whole point of naming a <c>NameClaimType</c>: the value is whatever claim the
    /// JWT bearer registration says identifies the caller, read without the endpoint knowing which
    /// claim that is. Asserting it here asserts the configuration, not a claim lookup of the
    /// test's own.
    /// </remarks>
    public string? CallingEmployee => Principal?.Identity?.Name;

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

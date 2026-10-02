namespace Tarjay.Team.Api.IntegrationTests;

/// <summary>
/// Routes more than one test class addresses, held once.
/// </summary>
/// <remarks>
/// <see cref="ProtectedUrl"/> in particular is asserted against from four classes — the auth
/// cases, the controller case, CORS and HTTPS redirection — and each of them cares that it is the
/// <em>same</em> endpoint, the one carrying <c>[Authorize]</c>. A copy per class made that
/// agreement invisible and would have let one drift.
/// </remarks>
internal static class TestRoutes
{
    /// <summary>The endpoint that carries <c>[Authorize]</c>.</summary>
    public const string ProtectedUrl = "/weatherforecast";
}

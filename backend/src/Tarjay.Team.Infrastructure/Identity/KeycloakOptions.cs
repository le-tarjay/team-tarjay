using System;

namespace Tarjay.Team.Infrastructure.Identity;

/// <summary>
/// How to reach Keycloak, the identity authority that holds employee credentials and resolves
/// role, department, and job function.
/// </summary>
/// <remarks>
/// Bound from the <c>Identity</c> configuration section. <see cref="ClientSecret"/> is a secret and
/// is never committed with a real value — it arrives from user-secrets locally and from a secret
/// store in a deployed environment.
/// </remarks>
public sealed class KeycloakOptions
{
    /// <summary>The configuration section these options bind from.</summary>
    public const string SectionName = "Identity";

    /// <summary>
    /// Base URL of the Keycloak server, e.g. <c>http://localhost:8080</c>. No trailing slash is
    /// required; one is tolerated.
    /// </summary>
    public string Authority { get; set; } = string.Empty;

    /// <summary>The Keycloak realm employees live in.</summary>
    public string Realm { get; set; } = string.Empty;

    /// <summary>The client id this API authenticates as when exchanging credentials.</summary>
    public string ClientId { get; set; } = string.Empty;

    /// <summary>
    /// The client secret for <see cref="ClientId"/>. Left empty for a public client; never
    /// committed with a real value, and never logged.
    /// </summary>
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>
    /// How long to wait on Keycloak before treating it as unreachable. Kept short: a sign-in is
    /// interactive, and an employee waiting at a register needs a decisive answer rather than a
    /// long hang.
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>
    /// The claim carrying the employee's authority tier. Configurable because it is a realm
    /// user-attribute mapper rather than a standard OIDC claim, so a realm that names it
    /// differently is a configuration change, not a code change.
    /// </summary>
    public string RoleClaim { get; set; } = "store_role";

    /// <summary>The claim carrying the employee's department. Configurable, as with <see cref="RoleClaim"/>.</summary>
    public string DepartmentClaim { get; set; } = "department";

    /// <summary>The claim carrying the employee's job function. Configurable, as with <see cref="RoleClaim"/>.</summary>
    public string JobFunctionClaim { get; set; } = "job_function";
}

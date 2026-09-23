namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// What a successful sign-in produces: who the employee is, and the credentials the device holds
/// for the session that follows.
/// </summary>
/// <remarks>
/// The tokens are the identity authority's own, passed through exactly as it issued them. This
/// store mints no session artifact of its own, so there is nothing here that could disagree with
/// what the authority believes. By the time a session exists, it is the employee's only live one —
/// establishing it ends whatever other sessions that employee held.
/// </remarks>
public sealed class EmployeeSession
{
    /// <summary>Who the employee is and what authority they hold.</summary>
    public required EmployeeIdentity Identity { get; init; }

    /// <summary>
    /// The access token the authority issued for this session, unmodified. Never logged.
    /// </summary>
    public required string AccessToken { get; init; }

    /// <summary>
    /// The refresh token the authority issued for this session, unmodified. Never logged.
    /// </summary>
    /// <remarks>
    /// The device exchanges this for a fresh access token on its own schedule. That exchange is
    /// also how a device whose session was ended elsewhere finds out: the authority refuses to
    /// refresh a session it no longer holds.
    /// </remarks>
    public required string RefreshToken { get; init; }
}

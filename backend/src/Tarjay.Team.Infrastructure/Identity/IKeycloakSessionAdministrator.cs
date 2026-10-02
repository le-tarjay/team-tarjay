using System.Threading;
using System.Threading.Tasks;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Infrastructure.Identity;

/// <summary>
/// Administers an employee's Keycloak sessions on the store's behalf, through Keycloak's Admin API.
/// </summary>
/// <remarks>
/// Lives in <c>Infrastructure</c> rather than <c>Domain</c> because everything it deals in — a
/// realm user id, a Keycloak session id — is the authority's own vocabulary, not the store's. The
/// store's own vocabulary stops at "an employee is signed in from one place at a time", which
/// <see cref="IEmployeeIdentityResolver"/> already expresses.
/// </remarks>
public interface IKeycloakSessionAdministrator
{
    /// <summary>
    /// Ends every session the employee holds apart from the one just established.
    /// </summary>
    /// <param name="userId">
    /// The employee's Keycloak user id — the <c>sub</c> claim, not the Employee ID they type.
    /// </param>
    /// <param name="currentSessionId">
    /// The session to keep: the one the sign-in that is happening right now just created. Every
    /// other session for this employee is ended.
    /// </param>
    /// <param name="cancellationToken">Cancels the calls to the authority.</param>
    /// <returns>
    /// How many other sessions were ended. Zero is an ordinary outcome, not a failure: an employee
    /// signing in with nothing else open has no other session to end.
    /// </returns>
    /// <exception cref="SessionTerminationFailedException">
    /// The other sessions could not be ended, for any reason — the admin client is not configured,
    /// the authority refused the service account, or the call never completed. Never swallowed:
    /// a caller that got no exception may rely on the employee holding exactly one session.
    /// </exception>
    public Task<int> TerminateOtherSessionsAsync(
        string userId,
        string currentSessionId,
        CancellationToken cancellationToken);
}

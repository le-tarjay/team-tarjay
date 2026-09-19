using System.Threading;
using System.Threading.Tasks;

namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// Resolves an Employee ID and PIN into the employee's session through the identity authority,
/// which is the only thing that holds credentials — this codebase never keeps a credential store
/// of its own, and never caches one.
/// </summary>
public interface IEmployeeIdentityResolver
{
    /// <summary>
    /// Verifies the credentials against the identity authority, ends every other session that
    /// employee holds, and returns the session the credentials resolve to.
    /// </summary>
    /// <param name="employeeId">The Employee ID being signed in.</param>
    /// <param name="pin">
    /// The PIN for that Employee ID. Never logged, and never included in an exception message, at
    /// any level.
    /// </param>
    /// <param name="cancellationToken">Cancels the call to the authority.</param>
    /// <returns>
    /// The resolved session, on success only. A returned session is the employee's only live one:
    /// ending the others is part of resolving, not a side effect that may or may not have happened.
    /// </returns>
    /// <exception cref="InvalidEmployeeCredentialsException">
    /// The authority did not accept this Employee ID and PIN pair. Raised identically for an
    /// unrecognized Employee ID and for a wrong PIN on a real one.
    /// </exception>
    /// <exception cref="IdentityProviderUnreachableException">
    /// The authority could not be reached. No cached or fallback identity is returned in its
    /// place — sign-in simply fails.
    /// </exception>
    /// <exception cref="EmployeeIdentityIncompleteException">
    /// The authority accepted the credentials but returned an identity missing an attribute the
    /// store needs, or a role outside the four it recognizes.
    /// </exception>
    /// <exception cref="SessionTerminationFailedException">
    /// The credentials were good, but the employee's other sessions could not be ended. No session
    /// is returned: a caller handed one anyway would be holding a session the store cannot say is
    /// the only live one.
    /// </exception>
    public Task<EmployeeSession> ResolveAsync(string employeeId, string pin, CancellationToken cancellationToken);
}

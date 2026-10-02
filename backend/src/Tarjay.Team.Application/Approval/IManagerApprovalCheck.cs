using System.Threading;
using System.Threading.Tasks;
using Tarjay.Team.Domain.Approval;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Application.Approval;

/// <summary>
/// Checks whether a named manager approves a request: their Employee ID and PIN first, then the
/// shared eligibility rule against the request's department.
/// </summary>
/// <remarks>
/// Stores nothing. A successful check is not an approval anyone can redeem later. Each restricted
/// action checks the manager's credentials again when it submits.
/// </remarks>
public interface IManagerApprovalCheck
{
    /// <summary>Checks the manager's credentials, then whether they may approve in the department.</summary>
    /// <param name="managerEmployeeId">The approving manager's Employee ID.</param>
    /// <param name="pin">The approving manager's PIN. Never logged, at any level.</param>
    /// <param name="requestDepartment">
    /// The department the request is scoped to: the requester's own, read from their token. Empty
    /// when the token carried none.
    /// </param>
    /// <param name="cancellationToken">Cancels the calls to the identity authority.</param>
    /// <returns>The approving manager, when they are recognized and eligible.</returns>
    /// <exception cref="ApproverNotRecognizedException">
    /// The Employee ID is unknown, the PIN is wrong, or the manager is locked out.
    /// </exception>
    /// <exception cref="ApproverNotEligibleException">
    /// The credentials are good, but the manager may not approve in this department right now.
    /// </exception>
    /// <exception cref="ApprovalCheckUnavailableException">The identity authority could not be reached.</exception>
    /// <exception cref="EmployeeIdentityIncompleteException">
    /// The authority accepted the credentials but returned an identity the store cannot use.
    /// </exception>
    public Task<EmployeeIdentity> CheckAsync(
        string managerEmployeeId,
        string pin,
        string requestDepartment,
        CancellationToken cancellationToken);
}

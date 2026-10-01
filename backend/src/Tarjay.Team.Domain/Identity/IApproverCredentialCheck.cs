using System.Threading;
using System.Threading.Tasks;

namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// Checks an approving manager's Employee ID and PIN with the identity authority, without signing
/// them in anywhere.
/// </summary>
/// <remarks>
/// <para>
/// Unlike <see cref="IEmployeeIdentityResolver"/>, this never ends the manager's other sessions. A
/// manager approving at someone else's register keeps their own register session and their own
/// clock-in exactly as they were. The only session it ends is the one the check itself had to
/// create in order to verify the PIN.
/// </para>
/// <para>
/// It says whether the credentials are good and who they belong to. It does not decide whether that
/// person may approve anything. That is the eligibility rule's job.
/// </para>
/// </remarks>
public interface IApproverCredentialCheck
{
    /// <summary>
    /// Verifies the Employee ID and PIN and, when they are good, reads whose they are.
    /// </summary>
    /// <param name="employeeId">The approving manager's Employee ID.</param>
    /// <param name="pin">
    /// The PIN for that Employee ID. Never logged, and never included in an exception message, at
    /// any level.
    /// </param>
    /// <param name="cancellationToken">Cancels the calls to the authority.</param>
    /// <returns>
    /// <see cref="ApproverCredentialOutcome.Valid"/> with the identity, or
    /// <see cref="ApproverCredentialOutcome.NotValid"/>, or
    /// <see cref="ApproverCredentialOutcome.Unreachable"/>.
    /// </returns>
    /// <exception cref="EmployeeIdentityIncompleteException">
    /// The authority accepted the credentials but returned an identity with no tier, or a tier the
    /// store does not recognize. A missing department or job function is not this failure: those
    /// come back empty.
    /// </exception>
    public Task<ApproverCredentialCheckResult> CheckAsync(
        string employeeId,
        string pin,
        CancellationToken cancellationToken);
}

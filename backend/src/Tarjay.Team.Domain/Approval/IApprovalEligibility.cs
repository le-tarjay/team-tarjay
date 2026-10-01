using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Domain.Approval;

/// <summary>
/// The one rule for who may approve a restricted action. Every domain that needs a manager's
/// sign-off asks this, in-process, rather than checking tier, department, or on-duty status
/// itself.
/// </summary>
/// <remarks>
/// <para>
/// An approver is eligible only when all of these hold:
/// </para>
/// <list type="bullet">
/// <item>They are a <see cref="EmployeeRole.DepartmentManager"/> whose department is the
/// request's department, or a <see cref="EmployeeRole.StoreManager"/>, whatever their own
/// department.</item>
/// <item>They are on duty: clocked in and not on break.</item>
/// </list>
/// <para>
/// An <see cref="EmployeeRole.Associate"/> or <see cref="EmployeeRole.ReceivingAssociate"/> is
/// never eligible. Nothing compares the approver to the requester, so a manager may approve their
/// own request when they are otherwise eligible.
/// </para>
/// <para>
/// This decides eligibility only. It does not check a PIN: the approver passed in is assumed to be
/// one whose credentials the caller has already verified.
/// </para>
/// </remarks>
public interface IApprovalEligibility
{
    /// <summary>Whether <paramref name="approver"/> may approve a request in <paramref name="requestDepartment"/>.</summary>
    /// <param name="approver">The manager whose credentials were entered, as the identity authority resolved them.</param>
    /// <param name="requestDepartment">
    /// The department the request is scoped to: the requester's own department, read from their
    /// token. Empty when the requester's token carried none, in which case only a Store Manager can
    /// be eligible.
    /// </param>
    /// <returns><see langword="true"/> only when every condition of the rule holds.</returns>
    public bool CanApprove(EmployeeIdentity approver, string requestDepartment);
}

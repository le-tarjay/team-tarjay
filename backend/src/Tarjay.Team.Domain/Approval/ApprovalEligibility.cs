using System;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Domain.Approval;

/// <summary>
/// The <see cref="IApprovalEligibility"/> rule, reading on-duty status from attendance.
/// </summary>
/// <param name="attendance">Where the approver's on-duty status is read from.</param>
/// <remarks>
/// On duty comes from <see cref="IAttendanceStore.IsOnDuty"/>, the same fact the shift gate reads,
/// so the two cannot disagree about whether a manager is clocked in and off break.
/// </remarks>
public sealed class ApprovalEligibility(IAttendanceStore attendance) : IApprovalEligibility
{
    /// <inheritdoc />
    public bool CanApprove(EmployeeIdentity approver, string requestDepartment)
    {
        ArgumentNullException.ThrowIfNull(approver);
        ArgumentNullException.ThrowIfNull(requestDepartment);

        return HasAuthorityIn(approver, requestDepartment) && attendance.IsOnDuty(approver.EmployeeId);
    }

    private static bool HasAuthorityIn(EmployeeIdentity approver, string requestDepartment) =>
        approver.Role switch
        {
            // Storewide by tier. The seeded Store Manager's own department is "Store Operations",
            // so their department is never compared.
            EmployeeRole.StoreManager => true,

            // An empty department on either side matches nothing. Two blanks are not a match.
            EmployeeRole.DepartmentManager =>
                !string.IsNullOrWhiteSpace(requestDepartment)
                && string.Equals(approver.Department, requestDepartment, StringComparison.Ordinal),

            // Associates, Receiving Associates, and any tier added later hold no approval
            // authority until this rule says otherwise.
            _ => false,
        };
}

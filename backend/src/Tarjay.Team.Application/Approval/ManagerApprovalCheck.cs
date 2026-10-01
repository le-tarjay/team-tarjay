using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Tarjay.Team.Domain.Approval;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Application.Approval;

/// <summary>
/// The <see cref="IManagerApprovalCheck"/> use case: the approver credential check, then the
/// shared eligibility rule.
/// </summary>
/// <param name="credentials">Checks the manager's Employee ID and PIN without signing them in.</param>
/// <param name="eligibility">The one rule for who may approve.</param>
/// <param name="logger">Records each outcome by Employee ID. The PIN is never passed to it.</param>
public sealed class ManagerApprovalCheck(
    IApproverCredentialCheck credentials,
    IApprovalEligibility eligibility,
    ILogger<ManagerApprovalCheck> logger) : IManagerApprovalCheck
{
    /// <inheritdoc />
    public async Task<EmployeeIdentity> CheckAsync(
        string managerEmployeeId,
        string pin,
        string requestDepartment,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(managerEmployeeId);
        ArgumentException.ThrowIfNullOrWhiteSpace(pin);
        ArgumentNullException.ThrowIfNull(requestDepartment);

        ApproverCredentialCheckResult result = await credentials.CheckAsync(managerEmployeeId, pin, cancellationToken);

        switch (result.Outcome)
        {
            case ApproverCredentialOutcome.NotValid:
                logger.LogWarning(
                    "Manager approval refused for employee {EmployeeId}: the credentials were not recognized",
                    managerEmployeeId);
                throw new ApproverNotRecognizedException();

            case ApproverCredentialOutcome.Unreachable:
                logger.LogWarning(
                    "Manager approval for employee {EmployeeId} could not be checked: the identity provider could not be reached",
                    managerEmployeeId);
                throw new ApprovalCheckUnavailableException();

            case ApproverCredentialOutcome.Valid when result.Identity is not null:
                break;

            default:
                throw new InvalidOperationException(
                    FormattableString.Invariant($"The approver credential check returned an unusable outcome: {result.Outcome}."));
        }

        EmployeeIdentity approver = result.Identity;

        if (!eligibility.CanApprove(approver, requestDepartment))
        {
            logger.LogWarning(
                "Manager approval refused for employee {EmployeeId}, a {Role} in {ApproverDepartment}: not eligible to approve in {RequestDepartment} right now",
                approver.EmployeeId,
                approver.Role,
                approver.Department,
                requestDepartment);
            throw new ApproverNotEligibleException();
        }

        logger.LogInformation(
            "Manager approval granted by employee {EmployeeId}, a {Role}, for a request in {RequestDepartment}",
            approver.EmployeeId,
            approver.Role,
            requestDepartment);

        return approver;
    }
}

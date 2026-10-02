using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Tarjay.Team.Api.Models;
using Tarjay.Team.Application.Approval;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Api.Controllers;

/// <summary>
/// Manager approval for restricted actions: the one shared check every such action's modal calls.
/// </summary>
[ApiController]
[Authorize]
[Route("v1/manager-approvals")]
public sealed class ManagerApprovalsController(
    IManagerApprovalCheck approvalCheck,
    IOptions<KeycloakOptions> identityOptions) : ControllerBase
{
    /// <summary>
    /// Checks a manager's Employee ID and PIN, then whether that manager may approve a request in
    /// the caller's department right now.
    /// </summary>
    /// <param name="request">The approving manager's Employee ID and PIN.</param>
    /// <param name="cancellationToken">Cancels the check.</param>
    /// <returns>The approving manager, wrapped in the standard success envelope.</returns>
    /// <remarks>
    /// The caller is the requester and must hold a valid token. The manager is checked without
    /// being signed in, so their own sessions are untouched. Nothing is stored: each action checks
    /// the manager's credentials again when it submits.
    /// <para>
    /// Refusals are 422 with a <c>reason</c> of <c>NotRecognized</c> or <c>NotEligible</c>. An
    /// unreachable identity provider is 503 with a <c>reason</c> of <c>Unavailable</c>. A 401 is
    /// only ever about the caller's own token.
    /// </para>
    /// </remarks>
    [HttpPost("check")]
    [ProducesResponseType(typeof(ApiResponse<ManagerApprovalCheckResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status502BadGateway)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<ApiResponse<ManagerApprovalCheckResponse>>> Check(
        ManagerApprovalCheckRequest request,
        CancellationToken cancellationToken)
    {
        // The request is scoped to the caller's own department. A token carrying none scopes it
        // to no department, which only a Store Manager can approve in.
        string requestDepartment = User.FindFirst(identityOptions.Value.DepartmentClaim)?.Value ?? string.Empty;

        // Both fields are non-null here: the validation filter rejected the request otherwise.
        EmployeeIdentity approver = await approvalCheck.CheckAsync(
            request.EmployeeId!,
            request.Pin!,
            requestDepartment,
            cancellationToken);

        return Ok(new ApiResponse<ManagerApprovalCheckResponse> { Data = ManagerApprovalCheckResponse.From(approver) });
    }
}

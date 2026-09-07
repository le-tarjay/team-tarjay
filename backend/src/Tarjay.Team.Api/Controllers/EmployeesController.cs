using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Api.Models;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.Controllers;

/// <summary>
/// Employee-facing endpoints. Today that is sign-in only.
/// </summary>
[ApiController]
[Route("v1/employees")]
public sealed class EmployeesController(IEmployeeIdentityResolver identityResolver) : ControllerBase
{
    /// <summary>
    /// Signs an employee in, resolving their Employee ID and PIN into the role, department, and
    /// job function they hold.
    /// </summary>
    /// <param name="request">The Employee ID and PIN being submitted.</param>
    /// <param name="cancellationToken">Cancels the sign-in.</param>
    /// <returns>The resolved identity, wrapped in the standard success envelope.</returns>
    /// <remarks>
    /// The identity resolved here is resolved once and holds for the session that follows; it is
    /// not re-checked against the authority on later requests.
    /// </remarks>
    [HttpPost("sign-in")]
    [ProducesResponseType(typeof(ApiResponse<SignInResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status502BadGateway)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<ApiResponse<SignInResponse>>> SignIn(
        SignInRequest request,
        CancellationToken cancellationToken)
    {
        // Both fields are non-null here: the validation filter rejected the request otherwise,
        // before this action was entered and before any call to the identity provider.
        var identity = await identityResolver.ResolveAsync(request.EmployeeId!, request.Pin!, cancellationToken);

        return Ok(new ApiResponse<SignInResponse> { Data = SignInResponse.From(identity) });
    }
}

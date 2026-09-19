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
    /// job function they hold, and into the tokens the new session runs on.
    /// </summary>
    /// <param name="request">The Employee ID and PIN being submitted.</param>
    /// <param name="cancellationToken">Cancels the sign-in.</param>
    /// <returns>The resolved session, wrapped in the standard success envelope.</returns>
    /// <remarks>
    /// The identity resolved here is resolved once and holds for the session that follows; it is
    /// not re-checked against the authority on later requests. Signing in also ends whatever other
    /// sessions the employee held, so a 200 from here means both that the credentials were good
    /// and that this is now the employee's only live session — the two are not reported separately
    /// because a caller cannot act on one without the other.
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
        var session = await identityResolver.ResolveAsync(request.EmployeeId!, request.Pin!, cancellationToken);

        return Ok(new ApiResponse<SignInResponse> { Data = SignInResponse.From(session) });
    }
}

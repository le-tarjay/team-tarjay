using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Domain.Approval;

namespace Tarjay.Team.Api.ExceptionHandling;

/// <summary>
/// Maps the approval aggregate's domain exceptions onto HTTP status codes. Handles only this
/// aggregate's own exception types and passes everything else down the chain.
/// </summary>
/// <remarks>
/// The two refusals share 422. The <see cref="ReasonExtension"/> on the body is what tells them
/// apart, and it is also what separates either of them from a validation failure's 422.
/// </remarks>
internal sealed class ApprovalExceptionHandler(IProblemDetailsService problemDetailsService) : IExceptionHandler
{
    /// <summary>The <c>ProblemDetails</c> extension naming why the approval was not given.</summary>
    public const string ReasonExtension = "reason";

    /// <summary>The Employee ID or PIN was unknown, wrong, or locked out.</summary>
    public const string NotRecognized = "NotRecognized";

    /// <summary>The credentials were good, but the manager may not approve this right now.</summary>
    public const string NotEligible = "NotEligible";

    /// <summary>The identity provider could not be reached.</summary>
    public const string Unavailable = "Unavailable";

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        var (status, title, reason) = exception switch
        {
            ApproverNotRecognizedException => (
                StatusCodes.Status422UnprocessableEntity,
                "The approving manager was not recognized.",
                NotRecognized),

            ApproverNotEligibleException => (
                StatusCodes.Status422UnprocessableEntity,
                "The approving manager can't approve this right now.",
                NotEligible),

            ApprovalCheckUnavailableException => (
                StatusCodes.Status503ServiceUnavailable,
                "Approval couldn't be checked right now.",
                Unavailable),

            _ => (0, string.Empty, string.Empty),
        };

        if (status == 0)
        {
            return false;
        }

        httpContext.Response.StatusCode = status;

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,

            // Safe to surface: every message in this aggregate is fixed text, and none of them
            // says which of the Employee ID and PIN was wrong.
            Detail = exception.Message,
            Instance = httpContext.Request.Path,
        };

        problem.Extensions[ReasonExtension] = reason;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = problem,
        });
    }
}

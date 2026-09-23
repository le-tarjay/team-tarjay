using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Api.ExceptionHandling;

/// <summary>
/// Maps the attendance aggregate's domain exceptions onto HTTP status codes. Handles only this
/// aggregate's own exception types and passes everything else down the chain.
/// </summary>
internal sealed class AttendanceExceptionHandler(IProblemDetailsService problemDetailsService) : IExceptionHandler
{
    /// <summary>
    /// The <c>ProblemDetails</c> extension carrying the shift status the rejection left in place.
    /// </summary>
    public const string ShiftStatusExtension = "shiftStatus";

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        if (exception is not ShiftTransitionRejectedException rejection)
        {
            return false;
        }

        // 409, not 422: the request is well-formed and would succeed from another status. It
        // conflicts with the state the employee's shift is in right now, which is what a client
        // needs to know to re-read that state rather than resubmit.
        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "The shift action was rejected.",

            // Safe to surface: the message is built from fixed phrases chosen by two enums, and
            // nothing the caller sent reaches it.
            Detail = rejection.Message,
            Instance = httpContext.Request.Path,
        };

        // The status the server holds, carried as a name exactly as the success envelope carries
        // it. A client can resync from this directly; re-reading the shift endpoint gives the same
        // answer.
        problem.Extensions[ShiftStatusExtension] = rejection.CurrentStatus.ToString();

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = problem,
        });
    }
}

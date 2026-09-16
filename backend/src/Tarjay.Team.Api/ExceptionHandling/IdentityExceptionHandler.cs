using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.ExceptionHandling;

/// <summary>
/// Maps the identity aggregate's domain exceptions onto HTTP status codes. Handles only this
/// aggregate's own exception types and passes everything else down the chain, so a new aggregate
/// gets a handler of its own rather than another branch in this one.
/// </summary>
internal sealed class IdentityExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;

    public IdentityExceptionHandler(IProblemDetailsService problemDetailsService)
    {
        ArgumentNullException.ThrowIfNull(problemDetailsService);

        _problemDetailsService = problemDetailsService;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        // The three failures get three different statuses because a caller has to be able to tell
        // them apart. "Your PIN was wrong" and "the store cannot reach corporate" call for
        // completely different things from the person standing at the register, and a single
        // shared status would leave the frontend guessing which message to show.
        var (status, title) = exception switch
        {
            InvalidEmployeeCredentialsException => (
                StatusCodes.Status401Unauthorized,
                "Sign-in was rejected."),

            IdentityProviderUnreachableException => (
                StatusCodes.Status503ServiceUnavailable,
                "Sign-in is unavailable."),

            EmployeeIdentityIncompleteException => (
                StatusCodes.Status502BadGateway,
                "The employee's identity could not be resolved."),

            _ => (0, string.Empty),
        };

        if (status == 0)
        {
            return false;
        }

        httpContext.Response.StatusCode = status;

        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title,

                // Safe to surface: every one of this aggregate's exception messages is built from
                // fixed text plus non-credential detail. None of them can carry a PIN, and the
                // rejection message deliberately does not say which of the two fields was wrong.
                Detail = exception.Message,
                Instance = httpContext.Request.Path,
            },
        });
    }
}

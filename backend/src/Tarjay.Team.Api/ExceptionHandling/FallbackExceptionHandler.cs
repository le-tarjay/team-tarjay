using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Tarjay.Team.Api.ExceptionHandling;

/// <summary>
/// The last handler in the chain: catches anything no aggregate handler recognized — the
/// genuinely unexpected case, where the request never completed its normal contract.
/// </summary>
/// <remarks>
/// Returns a bare 500 with no body at all. The absence of a payload is itself the signal: a
/// handled domain failure always carries a <c>ProblemDetails</c>, so a response with no body means
/// something broke before any domain logic could reason about it. The client gets nothing, but
/// nothing is lost — the full exception is always logged first.
/// </remarks>
internal sealed class FallbackExceptionHandler : IExceptionHandler
{
    private readonly ILogger<FallbackExceptionHandler> _logger;

    public FallbackExceptionHandler(ILogger<FallbackExceptionHandler> logger)
    {
        ArgumentNullException.ThrowIfNull(logger);

        _logger = logger;
    }

    public ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        // Logging here is not optional: this is the one path where the caller is told nothing, so
        // the logs are the only remaining record that it happened.
        _logger.LogError(
            exception,
            "Unhandled exception while handling {Method} {Path}",
            httpContext.Request.Method,
            httpContext.Request.Path);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        return ValueTask.FromResult(true);
    }
}

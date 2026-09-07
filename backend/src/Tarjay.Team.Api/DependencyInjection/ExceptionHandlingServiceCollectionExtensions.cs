using System;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Api.ExceptionHandling;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers the exception-handler chain that turns thrown exceptions into HTTP responses.
/// </summary>
internal static class ExceptionHandlingServiceCollectionExtensions
{
    /// <summary>
    /// Registers each aggregate's exception handler, then the fallback handler.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <returns>The same service collection, for chaining.</returns>
    /// <remarks>
    /// Registration order is the chain order, and the fallback must stay last — it handles
    /// everything, so anything registered after it would never be reached.
    /// </remarks>
    public static IServiceCollection AddApiExceptionHandling(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddProblemDetails();

        services.AddExceptionHandler<IdentityExceptionHandler>();
        services.AddExceptionHandler<FallbackExceptionHandler>();

        return services;
    }
}

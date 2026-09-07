using System;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Api.Validation;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers request validation: the validators themselves, and the filter that runs them.
/// </summary>
internal static class RequestValidationServiceCollectionExtensions
{
    /// <summary>
    /// Discovers every validator in this assembly and wires the filter that runs them ahead of
    /// each action.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <returns>The same service collection, for chaining.</returns>
    public static IServiceCollection AddRequestValidation(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        // Scanned rather than registered one by one, so adding a validator alongside a new request
        // DTO is enough to have it enforced — there is no second place to remember to update.
        services.AddValidatorsFromAssemblyContaining<SignInRequestValidator>(ServiceLifetime.Singleton);

        // Configured here rather than at the AddControllers call so that this concern stays in one
        // file, and so the filter is registered no matter what order composition happens in.
        services.Configure<MvcOptions>(static options => options.Filters.Add<ValidationActionFilter>());

        return services;
    }
}

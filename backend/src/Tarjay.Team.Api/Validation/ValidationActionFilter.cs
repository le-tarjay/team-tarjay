using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace Tarjay.Team.Api.Validation;

/// <summary>
/// Runs the FluentValidation validator for each of an action's arguments before the action body
/// executes, and short-circuits with a 422 if any of them fails.
/// </summary>
/// <remarks>
/// Running as a filter rather than inside each action is what makes "validated before anything
/// else happens" a property of the pipeline instead of a habit every action has to remember. For a
/// sign-in that matters concretely: a request with no PIN in it must be rejected without a call to
/// the identity provider ever being made.
/// </remarks>
internal sealed class ValidationActionFilter : IAsyncActionFilter
{
    private readonly IServiceProvider _services;

    public ValidationActionFilter(IServiceProvider services)
    {
        ArgumentNullException.ThrowIfNull(services);

        _services = services;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var failures = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        foreach (var parameter in context.ActionDescriptor.Parameters)
        {
            var validator = _services.GetService(typeof(IValidator<>).MakeGenericType(parameter.ParameterType))
                as IValidator;

            if (validator is null)
            {
                continue;
            }

            context.ActionArguments.TryGetValue(parameter.Name, out var argument);

            // A parameter that bound to null still gets validated, against a default instance, so
            // that it is reported field by field rather than skipped. A body MVC could not read at
            // all never reaches here — its own model-state filter runs first and returns a 400,
            // which is the right answer for a malformed request as opposed to an incomplete one.
            argument ??= Activator.CreateInstance(parameter.ParameterType);

            if (argument is null)
            {
                continue;
            }

            var result = await validator.ValidateAsync(new ValidationContext<object>(argument));

            foreach (var error in result.Errors)
            {
                var field = ToCamelCase(error.PropertyName);

                if (!failures.TryGetValue(field, out var messages))
                {
                    messages = [];
                    failures[field] = messages;
                }

                messages.Add(error.ErrorMessage);
            }
        }

        if (failures.Count > 0)
        {
            var problemDetails = new ValidationProblemDetails(
                failures.ToDictionary(entry => entry.Key, entry => entry.Value.ToArray(), StringComparer.Ordinal))
            {
                Status = StatusCodes.Status422UnprocessableEntity,
                Title = "The request could not be processed.",
                Detail = "One or more fields are missing or invalid.",
                Instance = context.HttpContext.Request.Path,
            };

            context.Result = new UnprocessableEntityObjectResult(problemDetails);
            return;
        }

        await next();
    }

    // Aligns the error key with the name the caller actually sent, since the request contract is
    // camelCase — an error a client cannot map back to its own field is only half an answer.
    private static string ToCamelCase(string propertyName)
    {
        if (string.IsNullOrEmpty(propertyName) || char.IsLower(propertyName[0]))
        {
            return propertyName;
        }

        return string.Concat(
            propertyName[0].ToString().ToLower(CultureInfo.InvariantCulture),
            propertyName.AsSpan(1));
    }
}

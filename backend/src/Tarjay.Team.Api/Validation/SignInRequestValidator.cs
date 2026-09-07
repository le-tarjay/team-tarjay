using FluentValidation;
using Tarjay.Team.Api.Models;

namespace Tarjay.Team.Api.Validation;

/// <summary>
/// Validates that a sign-in request carries both fields before the identity provider is called at
/// all — an incomplete request is this API's own failure to report, not something to spend a round
/// trip to Keycloak discovering.
/// </summary>
/// <remarks>
/// Deliberately shallow: it checks presence only. It says nothing about PIN length, allowed
/// characters, or Employee ID format, because the identity provider is the authority on what a
/// real credential looks like and duplicating its rules here would mean two places to keep in
/// step. Anything beyond "present" is a rejection, not a validation failure.
/// </remarks>
public sealed class SignInRequestValidator : AbstractValidator<SignInRequest>
{
    /// <summary>Initializes the validator.</summary>
    public SignInRequestValidator()
    {
        RuleFor(request => request.EmployeeId)
            .NotEmpty()
            .WithMessage("An Employee ID is required.");

        RuleFor(request => request.Pin)
            .NotEmpty()
            .WithMessage("A PIN is required.");
    }
}

using FluentValidation;
using Tarjay.Team.Api.Models;

namespace Tarjay.Team.Api.Validation;

/// <summary>
/// Validates that an approval check carries both fields before the identity provider is called.
/// </summary>
/// <remarks>
/// Presence only, as for sign-in. The identity provider is the authority on what a real Employee
/// ID and PIN look like.
/// </remarks>
public sealed class ManagerApprovalCheckRequestValidator : AbstractValidator<ManagerApprovalCheckRequest>
{
    /// <summary>Initializes the validator.</summary>
    public ManagerApprovalCheckRequestValidator()
    {
        RuleFor(request => request.EmployeeId)
            .NotEmpty()
            .WithMessage("The approving manager's Employee ID is required.");

        RuleFor(request => request.Pin)
            .NotEmpty()
            .WithMessage("The approving manager's PIN is required.");
    }
}

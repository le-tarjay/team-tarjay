using System;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Domain.Approval;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers the shared manager-approval eligibility rule.
/// </summary>
internal static class ApprovalServiceCollectionExtensions
{
    /// <summary>
    /// Registers <see cref="ApprovalEligibility"/> behind <see cref="IApprovalEligibility"/>, as a
    /// singleton.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <returns>The same service collection, for chaining.</returns>
    /// <remarks>
    /// The rule holds no state of its own and reads the attendance singleton, so one instance
    /// serves every caller. It needs <c>AddAttendance</c> registered as well.
    /// </remarks>
    public static IServiceCollection AddApprovalEligibility(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<IApprovalEligibility, ApprovalEligibility>();

        return services;
    }
}

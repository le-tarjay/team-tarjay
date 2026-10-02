using System;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Application.Approval;
using Tarjay.Team.Domain.Approval;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers the shared manager-approval eligibility rule and the approval check built on it.
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

    /// <summary>
    /// Registers <see cref="ManagerApprovalCheck"/> behind <see cref="IManagerApprovalCheck"/>, as
    /// transient.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <returns>The same service collection, for chaining.</returns>
    /// <remarks>
    /// Transient because the approver credential check it uses is a typed HTTP client, which DI
    /// hands out per resolution. It needs <see cref="AddApprovalEligibility"/> and
    /// <c>AddEmployeeIdentity</c> registered as well.
    /// </remarks>
    public static IServiceCollection AddManagerApprovalCheck(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddTransient<IManagerApprovalCheck, ManagerApprovalCheck>();

        return services;
    }
}

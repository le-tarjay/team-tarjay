using System;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Api.IntegrationTests.Attendance;
using Tarjay.Team.Domain.Approval;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Identity;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Approval;

/// <summary>
/// The eligibility rule as the app composes it: resolvable in-process by any domain, and reading
/// the same attendance store the shift endpoints write.
/// </summary>
public class ApprovalEligibilityRegistrationTests
{
    private const string Manager = "20001";

    private static readonly DateTimeOffset s_morning = new(2026, 10, 1, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ApprovalEligibility_IsResolvableAsOneInstanceForTheWholeApp()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();

        // Act
        IApprovalEligibility first = factory.Services.GetRequiredService<IApprovalEligibility>();
        IApprovalEligibility second = factory.Services.GetRequiredService<IApprovalEligibility>();

        // Assert
        Assert.Same(first, second);
    }

    [Fact]
    public void ApprovalEligibility_ReadsTheAppsAttendanceStore()
    {
        // Arrange — the manager is on shift only in the app's own attendance store.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Manager, s_morning));
        IApprovalEligibility rule = factory.Services.GetRequiredService<IApprovalEligibility>();
        EmployeeIdentity manager = new()
        {
            EmployeeId = Manager,
            Name = "Jordan Lee",
            Role = EmployeeRole.DepartmentManager,
            Department = "Grocery",
            JobFunction = "Management",
        };

        // Act
        bool eligibleOnShift = rule.CanApprove(manager, "Grocery");
        factory.Services.GetRequiredService<IAttendanceStore>().StartBreak(Manager);
        bool eligibleOnBreak = rule.CanApprove(manager, "Grocery");

        // Assert
        Assert.True(eligibleOnShift);
        Assert.False(eligibleOnBreak);
    }
}

using System;
using Moq;
using Tarjay.Team.Domain.Approval;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Domain.UnitTests.Approval;

public class ApprovalEligibilityTests
{
    private const string Grocery = "Grocery";
    private const string Apparel = "Apparel";
    private const string StoreOperations = "Store Operations";

    private const string Approver = "20001";
    private const string AnotherEmployee = "20002";

    private static readonly DateTimeOffset s_morning = new(2026, 10, 1, 8, 0, 0, TimeSpan.Zero);

    // The on-duty states, built as real attendance records so the rule reads the same fact the
    // shift gate does rather than a stubbed boolean.
    public enum Duty
    {
        OnShift,
        OnBreak,
        NeverClockedIn,
        ClockedOutEarlier,
    }

    [Fact]
    public void CanApprove_DepartmentManagerOnDutyInOwnDepartment_IsEligible()
    {
        // Arrange
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity manager = Employee(EmployeeRole.DepartmentManager, Grocery);

        // Act
        bool eligible = rule.CanApprove(manager, Grocery);

        // Assert
        Assert.True(eligible);
    }

    [Fact]
    public void CanApprove_DepartmentManagerOnDutyInAnotherDepartment_IsNotEligible()
    {
        // Arrange
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity manager = Employee(EmployeeRole.DepartmentManager, Grocery);

        // Act
        bool eligible = rule.CanApprove(manager, Apparel);

        // Assert
        Assert.False(eligible);
    }

    [Theory]
    [InlineData(Grocery)]
    [InlineData(Apparel)]
    [InlineData(StoreOperations)]
    [InlineData("")]
    public void CanApprove_StoreManagerOnDuty_IsEligibleInAnyDepartment(string requestDepartment)
    {
        // Arrange — the seeded Store Manager's own department is Store Operations, which matches
        // none of the departments they approve for.
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity manager = Employee(EmployeeRole.StoreManager, StoreOperations);

        // Act
        bool eligible = rule.CanApprove(manager, requestDepartment);

        // Assert
        Assert.True(eligible);
    }

    [Theory]
    [InlineData(EmployeeRole.DepartmentManager)]
    [InlineData(EmployeeRole.StoreManager)]
    public void CanApprove_ManagerClockedInButOnBreak_IsNotEligible(EmployeeRole role)
    {
        // Arrange — in their own department, so on break is the only thing standing in the way.
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnBreak));
        EmployeeIdentity manager = Employee(role, Grocery);

        // Act
        bool eligible = rule.CanApprove(manager, Grocery);

        // Assert
        Assert.False(eligible);
    }

    [Theory]
    [InlineData(EmployeeRole.DepartmentManager, Duty.NeverClockedIn)]
    [InlineData(EmployeeRole.DepartmentManager, Duty.ClockedOutEarlier)]
    [InlineData(EmployeeRole.StoreManager, Duty.NeverClockedIn)]
    [InlineData(EmployeeRole.StoreManager, Duty.ClockedOutEarlier)]
    public void CanApprove_ManagerNotClockedIn_IsNotEligible(EmployeeRole role, Duty duty)
    {
        // Arrange
        var rule = new ApprovalEligibility(Attendance(Approver, duty));
        EmployeeIdentity manager = Employee(role, Grocery);

        // Act
        bool eligible = rule.CanApprove(manager, Grocery);

        // Assert
        Assert.False(eligible);
    }

    [Theory]
    [InlineData(EmployeeRole.Associate, Duty.OnShift, Grocery)]
    [InlineData(EmployeeRole.Associate, Duty.OnShift, Apparel)]
    [InlineData(EmployeeRole.Associate, Duty.OnBreak, Grocery)]
    [InlineData(EmployeeRole.Associate, Duty.NeverClockedIn, Grocery)]
    [InlineData(EmployeeRole.ReceivingAssociate, Duty.OnShift, Grocery)]
    [InlineData(EmployeeRole.ReceivingAssociate, Duty.OnShift, Apparel)]
    [InlineData(EmployeeRole.ReceivingAssociate, Duty.OnBreak, Grocery)]
    [InlineData(EmployeeRole.ReceivingAssociate, Duty.NeverClockedIn, Grocery)]
    public void CanApprove_AssociateOrReceivingAssociate_IsNeverEligible(
        EmployeeRole role,
        Duty duty,
        string requestDepartment)
    {
        // Arrange — the employee's own department is Grocery throughout.
        var rule = new ApprovalEligibility(Attendance(Approver, duty));
        EmployeeIdentity employee = Employee(role, Grocery);

        // Act
        bool eligible = rule.CanApprove(employee, requestDepartment);

        // Assert
        Assert.False(eligible);
    }

    [Theory]
    [InlineData(EmployeeRole.Associate)]
    [InlineData(EmployeeRole.ReceivingAssociate)]
    public void CanApprove_NonManagerReportedOnDuty_IsNotEligible(EmployeeRole role)
    {
        // Arrange — attendance says yes outright. Tier alone must refuse.
        var attendance = new Mock<IAttendanceStore>();
        attendance.Setup(store => store.IsOnDuty(It.IsAny<string>())).Returns(true);
        var rule = new ApprovalEligibility(attendance.Object);

        // Act
        bool eligible = rule.CanApprove(Employee(role, Grocery), Grocery);

        // Assert
        Assert.False(eligible);
    }

    [Theory]
    [InlineData(EmployeeRole.DepartmentManager, Grocery, Grocery)]
    [InlineData(EmployeeRole.StoreManager, StoreOperations, StoreOperations)]
    public void CanApprove_ManagerApprovingTheirOwnRequest_IsEligible(
        EmployeeRole role,
        string ownDepartment,
        string requestDepartment)
    {
        // Arrange — the manager is also the requester, so the request's department is the one on
        // their own token.
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity managerWhoIsAlsoTheRequester = Employee(role, ownDepartment);

        // Act
        bool eligible = rule.CanApprove(managerWhoIsAlsoTheRequester, requestDepartment);

        // Assert
        Assert.True(eligible);
    }

    [Fact]
    public void CanApprove_ReadsOnDutyForTheApproverNotAnyoneElse()
    {
        // Arrange — someone else in the department is on shift; the approver never clocked in.
        var rule = new ApprovalEligibility(Attendance(AnotherEmployee, Duty.OnShift));
        EmployeeIdentity manager = Employee(EmployeeRole.DepartmentManager, Grocery);

        // Act
        bool eligible = rule.CanApprove(manager, Grocery);

        // Assert
        Assert.False(eligible);
    }

    [Fact]
    public void CanApprove_AsksAttendanceAboutTheApproversEmployeeId()
    {
        // Arrange
        var attendance = new Mock<IAttendanceStore>();
        attendance.Setup(store => store.IsOnDuty(Approver)).Returns(true);
        var rule = new ApprovalEligibility(attendance.Object);

        // Act
        bool eligible = rule.CanApprove(Employee(EmployeeRole.DepartmentManager, Grocery), Grocery);

        // Assert
        Assert.True(eligible);
        attendance.Verify(store => store.IsOnDuty(Approver), Times.Once);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData(" ", " ")]
    [InlineData(Grocery, "")]
    [InlineData("", Grocery)]
    public void CanApprove_DepartmentManagerWithABlankDepartmentOnEitherSide_IsNotEligible(
        string ownDepartment,
        string requestDepartment)
    {
        // Arrange — two blanks must not count as the same department.
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity manager = Employee(EmployeeRole.DepartmentManager, ownDepartment);

        // Act
        bool eligible = rule.CanApprove(manager, requestDepartment);

        // Assert
        Assert.False(eligible);
    }

    [Fact]
    public void CanApprove_DepartmentManagerWhoseDepartmentDiffersOnlyByCase_IsNotEligible()
    {
        // Arrange — both departments come from the same realm attribute, so they match exactly or
        // not at all.
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity manager = Employee(EmployeeRole.DepartmentManager, Grocery);

        // Act
        bool eligible = rule.CanApprove(manager, "grocery");

        // Assert
        Assert.False(eligible);
    }

    [Fact]
    public void CanApprove_TierOutsideTheFourKnown_IsNotEligible()
    {
        // Arrange
        var rule = new ApprovalEligibility(Attendance(Approver, Duty.OnShift));
        EmployeeIdentity employee = Employee((EmployeeRole)99, Grocery);

        // Act
        bool eligible = rule.CanApprove(employee, Grocery);

        // Assert
        Assert.False(eligible);
    }

    [Fact]
    public void CanApprove_WithNullApprover_Throws()
    {
        // Arrange
        var rule = new ApprovalEligibility(new InMemoryAttendanceStore());

        // Act and assert
        Assert.Throws<ArgumentNullException>("approver", () => rule.CanApprove(null!, Grocery));
    }

    [Fact]
    public void CanApprove_WithNullRequestDepartment_Throws()
    {
        // Arrange
        var rule = new ApprovalEligibility(new InMemoryAttendanceStore());
        EmployeeIdentity manager = Employee(EmployeeRole.StoreManager, StoreOperations);

        // Act and assert
        Assert.Throws<ArgumentNullException>("requestDepartment", () => rule.CanApprove(manager, null!));
    }

    private static EmployeeIdentity Employee(EmployeeRole role, string department) => new()
    {
        EmployeeId = Approver,
        Name = "Jordan Lee",
        Role = role,
        Department = department,
        JobFunction = "Management",
    };

    private static InMemoryAttendanceStore Attendance(string employeeId, Duty duty) => duty switch
    {
        Duty.OnShift => new InMemoryAttendanceStore([new AttendanceRecord(employeeId, s_morning)]),
        Duty.OnBreak => new InMemoryAttendanceStore(
        [
            new AttendanceRecord(employeeId, s_morning, breaks: [new BreakInterval(s_morning.AddHours(2))]),
        ]),
        Duty.NeverClockedIn => new InMemoryAttendanceStore(),
        Duty.ClockedOutEarlier => new InMemoryAttendanceStore(
        [
            new AttendanceRecord(employeeId, s_morning, clockedOutAt: s_morning.AddHours(4)),
        ]),
        _ => throw new ArgumentOutOfRangeException(nameof(duty)),
    };
}

using System;
using System.Collections.Generic;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Domain.UnitTests.Attendance;

public class AttendanceRecordTests
{
    private const string Employee = "10042";

    private static readonly DateTimeOffset s_morning = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Constructor_WithNoClockOut_IsActive()
    {
        // Arrange / Act
        var record = new AttendanceRecord(Employee, s_morning);

        // Assert
        Assert.True(record.IsActive);
        Assert.Null(record.ClockedOutAt);
        Assert.Empty(record.Breaks);
        Assert.Equal(Employee, record.EmployeeId);
        Assert.Equal(s_morning, record.ClockedInAt);
    }

    [Fact]
    public void Constructor_WithAClockOut_IsCompleted()
    {
        // Arrange / Act
        var record = new AttendanceRecord(Employee, s_morning, clockedOutAt: s_morning.AddHours(8));

        // Assert
        Assert.False(record.IsActive);
        Assert.False(record.IsOnBreak);
    }

    [Fact]
    public void IsOnBreak_WhenTheLatestBreakIsOpen_IsTrue()
    {
        // Arrange / Act
        var record = new AttendanceRecord(
            Employee,
            s_morning,
            breaks:
            [
                new BreakInterval(s_morning.AddHours(1), s_morning.AddHours(1.25)),
                new BreakInterval(s_morning.AddHours(3)),
            ]);

        // Assert
        Assert.True(record.IsOnBreak);
    }

    [Fact]
    public void IsOnBreak_WhenEveryBreakHasEnded_IsFalse()
    {
        // Arrange / Act
        var record = new AttendanceRecord(
            Employee,
            s_morning,
            breaks: [new BreakInterval(s_morning.AddHours(1), s_morning.AddHours(1.25))]);

        // Assert
        Assert.False(record.IsOnBreak);
    }

    [Fact]
    public void Constructor_WithAnOpenBreakThatIsNotTheLatest_Throws()
    {
        // Arrange — a second break cannot start while the first is still running.
        BreakInterval[] breaks =
        [
            new BreakInterval(s_morning.AddHours(1)),
            new BreakInterval(s_morning.AddHours(3), s_morning.AddHours(3.25)),
        ];

        // Act / Assert
        Assert.Throws<ArgumentException>(() => new AttendanceRecord(Employee, s_morning, breaks: breaks));
    }

    [Fact]
    public void Constructor_ClockedOutWithABreakStillOpen_Throws()
    {
        // Arrange — clocking out ends the shift, and a break is part of the shift.
        BreakInterval[] breaks = [new BreakInterval(s_morning.AddHours(1))];

        // Act / Assert
        Assert.Throws<ArgumentException>(
            () => new AttendanceRecord(Employee, s_morning, clockedOutAt: s_morning.AddHours(2), breaks: breaks));
    }

    [Fact]
    public void Constructor_WithANullBreak_Throws()
    {
        // Arrange
        BreakInterval[] breaks = [null!];

        // Act / Assert
        Assert.Throws<ArgumentException>(() => new AttendanceRecord(Employee, s_morning, breaks: breaks));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_WithABlankEmployeeId_Throws(string employeeId)
    {
        // Act / Assert
        Assert.Throws<ArgumentException>(() => new AttendanceRecord(employeeId, s_morning));
    }

    [Fact]
    public void Constructor_WithANullEmployeeId_Throws()
    {
        // Act / Assert
        Assert.Throws<ArgumentNullException>(() => new AttendanceRecord(null!, s_morning));
    }

    [Fact]
    public void Breaks_AreCopiedAtConstruction_SoTheCallersListCannotChangeTheRecord()
    {
        // Arrange — records are handed out from a shared singleton, so one must not be mutable
        // through a list its creator kept hold of.
        var breaks = new List<BreakInterval>
        {
            new(s_morning.AddHours(1), s_morning.AddHours(1.25)),
        };
        var record = new AttendanceRecord(Employee, s_morning, breaks: breaks);

        // Act
        breaks.Add(new BreakInterval(s_morning.AddHours(3)));

        // Assert
        Assert.Single(record.Breaks);
        Assert.False(record.IsOnBreak);
    }
}

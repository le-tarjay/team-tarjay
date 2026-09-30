using System;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

public class ScheduledShiftTests
{
    private static readonly DateOnly s_wednesday = new(2026, 9, 23);
    private static readonly ShiftHours s_hours = new(new TimeOnly(9, 0), new TimeOnly(17, 0));

    [Fact]
    public void Worked_CarriesItsDateDepartmentAndHours_AndIsNotADayOff()
    {
        // Act
        ScheduledShift shift = ScheduledShift.Worked(s_wednesday, "Grocery", s_hours);

        // Assert
        Assert.Equal(s_wednesday, shift.Date);
        Assert.Equal(DayOfWeek.Wednesday, shift.Day);
        Assert.Equal("Grocery", shift.Department);
        Assert.Equal(s_hours, shift.Hours);
        Assert.False(shift.IsDayOff);
    }

    [Fact]
    public void DayOff_CarriesNoTimeRange_AndIsADayOff()
    {
        // Act
        ScheduledShift shift = ScheduledShift.DayOff(s_wednesday, "Grocery");

        // Assert — a day off is its own kind of entry, not a shift with empty hours.
        Assert.True(shift.IsDayOff);
        Assert.Null(shift.Hours);
        Assert.Equal("Grocery", shift.Department);
    }

    [Fact]
    public void DayOff_IsNeverEqualToAWorkedShiftOnTheSameDay()
    {
        // Act
        ScheduledShift dayOff = ScheduledShift.DayOff(s_wednesday, "Grocery");
        ScheduledShift worked = ScheduledShift.Worked(s_wednesday, "Grocery", s_hours);

        // Assert
        Assert.NotEqual(worked, dayOff);
    }

    [Fact]
    public void Worked_WithNullHours_Throws()
    {
        // Act, Assert — a worked shift with no hours would be a day off in disguise.
        Assert.Throws<ArgumentNullException>(() => ScheduledShift.Worked(s_wednesday, "Grocery", null!));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Worked_WithABlankDepartment_Throws(string? department)
    {
        // Act, Assert
        Assert.ThrowsAny<ArgumentException>(() => ScheduledShift.Worked(s_wednesday, department!, s_hours));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void DayOff_WithABlankDepartment_Throws(string? department)
    {
        // Act, Assert
        Assert.ThrowsAny<ArgumentException>(() => ScheduledShift.DayOff(s_wednesday, department!));
    }
}

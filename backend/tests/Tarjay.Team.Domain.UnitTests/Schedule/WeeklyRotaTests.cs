using System;
using System.Collections.Generic;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

public class WeeklyRotaTests
{
    private static readonly ShiftHours s_hours = new(new TimeOnly(9, 0), new TimeOnly(17, 0));
    private static readonly DateOnly s_monday = new(2026, 9, 21);
    private static readonly DateOnly s_tuesday = new(2026, 9, 22);

    [Fact]
    public void ShiftOn_AWorkingDay_ReturnsAWorkedShiftWithThatDaysHours()
    {
        // Arrange
        var rota = new WeeklyRota("Grocery", new Dictionary<DayOfWeek, ShiftHours> { [DayOfWeek.Monday] = s_hours });

        // Act
        ScheduledShift shift = rota.ShiftOn(s_monday);

        // Assert
        Assert.Equal(ScheduledShift.Worked(s_monday, "Grocery", s_hours), shift);
    }

    [Fact]
    public void ShiftOn_ADayTheRotaDoesNotList_ReturnsADayOffInTheSameDepartment()
    {
        // Arrange
        var rota = new WeeklyRota("Grocery", new Dictionary<DayOfWeek, ShiftHours> { [DayOfWeek.Monday] = s_hours });

        // Act
        ScheduledShift shift = rota.ShiftOn(s_tuesday);

        // Assert
        Assert.Equal(ScheduledShift.DayOff(s_tuesday, "Grocery"), shift);
    }

    [Fact]
    public void ShiftOn_AfterTheSourceDictionaryChanges_StillUsesTheOriginalWeek()
    {
        // Arrange
        var workingDays = new Dictionary<DayOfWeek, ShiftHours> { [DayOfWeek.Monday] = s_hours };
        var rota = new WeeklyRota("Grocery", workingDays);

        // Act
        workingDays[DayOfWeek.Tuesday] = s_hours;

        // Assert — the rota took a copy, so it can't be edited from outside.
        Assert.True(rota.ShiftOn(s_tuesday).IsDayOff);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_WithABlankDepartment_Throws(string? department)
    {
        // Act, Assert
        Assert.ThrowsAny<ArgumentException>(() => new WeeklyRota(department!, new Dictionary<DayOfWeek, ShiftHours>()));
    }

    [Fact]
    public void Constructor_WithNullWorkingDays_Throws()
    {
        // Act, Assert
        Assert.Throws<ArgumentNullException>(() => new WeeklyRota("Grocery", null!));
    }

    [Fact]
    public void Constructor_WithAWorkingDayThatHasNoHours_Throws()
    {
        // Arrange
        var workingDays = new Dictionary<DayOfWeek, ShiftHours> { [DayOfWeek.Monday] = null! };

        // Act, Assert
        Assert.Throws<ArgumentException>(() => new WeeklyRota("Grocery", workingDays));
    }

    [Fact]
    public void Constructor_WithAValueThatIsNotADayOfTheWeek_Throws()
    {
        // Arrange
        var workingDays = new Dictionary<DayOfWeek, ShiftHours> { [(DayOfWeek)7] = s_hours };

        // Act, Assert
        Assert.Throws<ArgumentException>(() => new WeeklyRota("Grocery", workingDays));
    }
}

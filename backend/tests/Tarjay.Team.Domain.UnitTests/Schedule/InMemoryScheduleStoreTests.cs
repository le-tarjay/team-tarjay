using System;
using System.Collections.Generic;
using System.Linq;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

public class InMemoryScheduleStoreTests
{
    private const string Employee = "10041";
    private const string AnotherEmployee = "10042";

    // A Wednesday. The window runs from Thursday 17 September to Tuesday 6 October.
    private static readonly DateOnly s_today = new(2026, 9, 23);
    private static readonly FixedTimeProvider s_clock = new(new DateTimeOffset(2026, 9, 23, 10, 0, 0, TimeSpan.Zero));

    private static readonly ShiftHours s_morning = new(new TimeOnly(9, 0), new TimeOnly(17, 0));
    private static readonly ShiftHours s_evening = new(new TimeOnly(13, 0), new TimeOnly(21, 0));

    // Works Monday and Wednesday mornings in Grocery; every other day is off.
    private static readonly WeeklyRota s_groceryRota = new(
        "Grocery",
        new Dictionary<DayOfWeek, ShiftHours>
        {
            [DayOfWeek.Monday] = s_morning,
            [DayOfWeek.Wednesday] = s_morning,
        });

    // Works Thursday evenings in Receiving; every other day is off.
    private static readonly WeeklyRota s_receivingRota = new(
        "Receiving",
        new Dictionary<DayOfWeek, ShiftHours> { [DayOfWeek.Thursday] = s_evening });

    [Fact]
    public void GetShifts_ForAnEmployeeWithARota_ReturnsOneEntryPerDayInDateOrder()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts(Employee);

        // Assert — every day of the window, each once, ascending, with no gaps.
        Assert.Equal(ScheduleWindow.Length, shifts.Count);

        for (int index = 1; index < shifts.Count; index++)
        {
            Assert.Equal(shifts[index - 1].Date.AddDays(1), shifts[index].Date);
        }
    }

    [Fact]
    public void GetShifts_CoversSixDaysBeforeTodayThroughThirteenDaysAfter()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts(Employee);

        // Assert — far enough back for any first day of the calendar week, and two weeks ahead.
        Assert.Equal(new DateOnly(2026, 9, 17), shifts[0].Date);
        Assert.Equal(new DateOnly(2026, 10, 6), shifts[^1].Date);
        Assert.Contains(shifts, shift => shift.Date == s_today);
    }

    [Fact]
    public void GetShifts_ProjectsTheRotaOntoEachDate()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts(Employee);

        // Assert — Mondays and Wednesdays are the rota's hours; every other day is off.
        foreach (ScheduledShift shift in shifts)
        {
            bool works = shift.Day is DayOfWeek.Monday or DayOfWeek.Wednesday;

            Assert.Equal(!works, shift.IsDayOff);
            Assert.Equal(works ? s_morning : null, shift.Hours);
            Assert.Equal("Grocery", shift.Department);
        }
    }

    [Fact]
    public void GetShifts_OnAScheduledDayOff_ReturnsADayOffWithNoTimeRange()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));

        // Act — Thursday 24 September is not one of the rota's days.
        ScheduledShift thursday = store.GetShifts(Employee).Single(shift => shift.Date == new DateOnly(2026, 9, 24));

        // Assert
        Assert.True(thursday.IsDayOff);
        Assert.Null(thursday.Hours);
    }

    [Fact]
    public void GetShifts_ForTwoEmployees_ReturnsEachOnlyTheirOwnRota()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(
            s_clock,
            (Employee, s_groceryRota),
            (AnotherEmployee, s_receivingRota));

        // Act
        IReadOnlyList<ScheduledShift> mine = store.GetShifts(Employee);
        IReadOnlyList<ScheduledShift> theirs = store.GetShifts(AnotherEmployee);

        // Assert — nothing of the other employee's department or working days shows up in either.
        Assert.All(mine, shift => Assert.Equal("Grocery", shift.Department));
        Assert.All(theirs, shift => Assert.Equal("Receiving", shift.Department));
        Assert.All(
            mine.Where(shift => !shift.IsDayOff),
            shift => Assert.Contains(shift.Day, new[] { DayOfWeek.Monday, DayOfWeek.Wednesday }));
        Assert.All(theirs.Where(shift => !shift.IsDayOff), shift => Assert.Equal(DayOfWeek.Thursday, shift.Day));
    }

    [Fact]
    public void GetShifts_ForAnEmployeeWithNoRota_ReturnsAnEmptyList()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts("99999");

        // Assert — no schedule is an empty schedule, not an error.
        Assert.Empty(shifts);
    }

    [Fact]
    public void GetShifts_ReadsTodayInTheClocksLocalTimeZone()
    {
        // Arrange — 22:30 UTC on Wednesday is already 03:30 Thursday five hours east, so the store
        // measures the window from Thursday.
        TimeZoneInfo fiveHoursEast = TimeZoneInfo.CreateCustomTimeZone("Test+05", TimeSpan.FromHours(5), "Test+05", "Test+05");
        var clock = new FixedTimeProvider(new DateTimeOffset(2026, 9, 23, 22, 30, 0, TimeSpan.Zero), fiveHoursEast);
        InMemoryScheduleStore store = StoreWith(clock, (Employee, s_groceryRota));

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts(Employee);

        // Assert
        Assert.Equal(ScheduleWindow.FirstDay(new DateOnly(2026, 9, 24)), shifts[0].Date);
    }

    [Fact]
    public void GetShifts_OnALaterDay_MovesTheWindowForward()
    {
        // Arrange — the same rota, read a week later.
        var nextWeek = new FixedTimeProvider(new DateTimeOffset(2026, 9, 30, 10, 0, 0, TimeSpan.Zero));
        InMemoryScheduleStore store = StoreWith(nextWeek, (Employee, s_groceryRota));

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts(Employee);

        // Assert — the seed never goes stale, because the rota projects onto whatever today is.
        Assert.Equal(new DateOnly(2026, 9, 24), shifts[0].Date);
        Assert.Equal(new DateOnly(2026, 10, 13), shifts[^1].Date);
    }

    [Fact]
    public void GetShifts_ReturnsAListCallersCannotChange()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));
        var shifts = (IList<ScheduledShift>)store.GetShifts(Employee);

        // Act
        Exception? thrown = Record.Exception(() => shifts.Add(ScheduledShift.DayOff(s_today, "Grocery")));

        // Assert — the schedule is read-only all the way out.
        Assert.IsType<NotSupportedException>(thrown);
    }

    [Fact]
    public void GetShifts_WithANullEmployeeId_Throws()
    {
        // Arrange
        InMemoryScheduleStore store = StoreWith(s_clock, (Employee, s_groceryRota));

        // Act, Assert
        Assert.Throws<ArgumentNullException>(() => store.GetShifts(null!));
    }

    [Fact]
    public void Constructor_WithNoRotas_UsesTheSeededRoster()
    {
        // Arrange
        var store = new InMemoryScheduleStore(s_clock);

        // Act
        IReadOnlyList<ScheduledShift> shifts = store.GetShifts("10041");

        // Assert
        Assert.Equal(ScheduleWindow.Length, shifts.Count);
    }

    [Fact]
    public void Constructor_WithANullClock_Throws()
    {
        // Act, Assert
        Assert.Throws<ArgumentNullException>(() => new InMemoryScheduleStore(null!));
    }

    [Fact]
    public void Constructor_WithNullRotas_Throws()
    {
        // Act, Assert
        Assert.Throws<ArgumentNullException>(() => new InMemoryScheduleStore(s_clock, null!));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_WithABlankEmployeeId_Throws(string employeeId)
    {
        // Arrange
        var rotas = new Dictionary<string, WeeklyRota> { [employeeId] = s_groceryRota };

        // Act, Assert
        Assert.Throws<ArgumentException>(() => new InMemoryScheduleStore(s_clock, rotas));
    }

    [Fact]
    public void Constructor_WithANullRota_Throws()
    {
        // Arrange
        var rotas = new Dictionary<string, WeeklyRota> { [Employee] = null! };

        // Act, Assert
        Assert.Throws<ArgumentException>(() => new InMemoryScheduleStore(s_clock, rotas));
    }

    private static InMemoryScheduleStore StoreWith(TimeProvider clock, params (string EmployeeId, WeeklyRota Rota)[] rotas) =>
        new(clock, rotas.ToDictionary(entry => entry.EmployeeId, entry => entry.Rota));
}

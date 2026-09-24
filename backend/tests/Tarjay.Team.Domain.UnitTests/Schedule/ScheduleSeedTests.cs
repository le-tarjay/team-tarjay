using System;
using System.Collections.Generic;
using System.Linq;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

public class ScheduleSeedTests
{
    // The local realm's employees and their `department` attributes, from
    // infrastructure/local/keycloak/team-targe-realm.json.
    public static TheoryData<string, string> RealmEmployees => new()
    {
        { "10041", "Grocery" },
        { "10042", "Grocery" },
        { "10043", "Store Operations" },
        { "10044", "Receiving" },
        { "10045", "Grocery" },
    };

    public static TheoryData<string> RealmEmployeeIds => ["10041", "10042", "10043", "10044", "10045"];

    [Fact]
    public void Rotas_CoverExactlyTheEmployeesTheRealmSeeds()
    {
        // Act
        string[] seeded = [.. ScheduleSeed.Rotas.Keys.Order(StringComparer.Ordinal)];

        // Assert
        Assert.Equal(["10041", "10042", "10043", "10044", "10045"], seeded);
    }

    [Theory]
    [MemberData(nameof(RealmEmployees))]
    public void Rotas_ScheduleEachEmployeeInTheirRealmDepartment(string employeeId, string department)
    {
        // Act
        WeeklyRota rota = ScheduleSeed.Rotas[employeeId];

        // Assert
        Assert.Equal(department, rota.Department);
    }

    [Theory]
    [MemberData(nameof(RealmEmployeeIds))]
    public void Rotas_GiveEachEmployeeSeveralWorkedShiftsAndADayOffEveryWeek(string employeeId)
    {
        // Arrange
        WeeklyRota rota = ScheduleSeed.Rotas[employeeId];

        // Act — one of each day of the week.
        ScheduledShift[] week = [.. Enumerable.Range(0, 7).Select(offset => rota.ShiftOn(new DateOnly(2026, 9, 21).AddDays(offset)))];

        // Assert — the Home preview needs three worked shifts ahead on any day, and the week view
        // needs a day off to show.
        Assert.True(week.Count(shift => !shift.IsDayOff) >= 3);
        Assert.Contains(week, shift => shift.IsDayOff);
    }

    [Fact]
    public void Rotas_GiveNoTwoEmployeesTheSameWeek()
    {
        // Arrange
        var monday = new DateOnly(2026, 9, 21);

        // Act
        List<string> weeks =
        [
            .. ScheduleSeed.Rotas.Values.Select(rota => string.Join(
                "|",
                Enumerable.Range(0, 7).Select(offset => rota.ShiftOn(monday.AddDays(offset))))),
        ];

        // Assert — so one employee's schedule can never pass for another's in a test.
        Assert.Equal(weeks.Count, weeks.Distinct(StringComparer.Ordinal).Count());
    }
}

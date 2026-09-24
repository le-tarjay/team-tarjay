using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// The demo roster's schedules: one weekly rota for each employee the local realm seeds.
/// </summary>
/// <remarks>
/// <para>
/// Keyed on the realm's real Employee IDs, <c>10041</c> to <c>10045</c>, so every employee a demo
/// can sign in as has a schedule. Each rota's department matches that employee's
/// <c>department</c> attribute in the realm export
/// (<c>infrastructure/local/keycloak/team-targe-realm.json</c>). If the realm's roster changes,
/// this changes with it.
/// </para>
/// <para>
/// Each rota works five days and has two off. The weeks are deliberately different from one
/// another, so one employee's schedule can never pass for another's. The associate's week is the
/// one the design asset's My schedule screen shows.
/// </para>
/// </remarks>
public static class ScheduleSeed
{
    /// <summary>Each seeded employee's rota, keyed on Employee ID.</summary>
    public static IReadOnlyDictionary<string, WeeklyRota> Rotas { get; } =
        new ReadOnlyDictionary<string, WeeklyRota>(new Dictionary<string, WeeklyRota>(StringComparer.Ordinal)
        {
            // Dana Okafor — Associate, Grocery. The design asset's own week.
            ["10041"] = new WeeklyRota(
                "Grocery",
                new Dictionary<DayOfWeek, ShiftHours>
                {
                    [DayOfWeek.Monday] = Hours(11, 0, 19, 0),
                    [DayOfWeek.Tuesday] = Hours(9, 0, 15, 0),
                    [DayOfWeek.Thursday] = Hours(12, 0, 20, 0),
                    [DayOfWeek.Friday] = Hours(9, 0, 17, 0),
                    [DayOfWeek.Saturday] = Hours(9, 0, 17, 0),
                }),

            // Sam Rivera — Department Manager, Grocery. Opens the department early in the week.
            ["10042"] = new WeeklyRota(
                "Grocery",
                new Dictionary<DayOfWeek, ShiftHours>
                {
                    [DayOfWeek.Monday] = Hours(7, 0, 15, 30),
                    [DayOfWeek.Tuesday] = Hours(7, 0, 15, 30),
                    [DayOfWeek.Wednesday] = Hours(7, 0, 15, 30),
                    [DayOfWeek.Friday] = Hours(10, 0, 18, 30),
                    [DayOfWeek.Saturday] = Hours(8, 0, 16, 30),
                }),

            // Alex Mercer — Store Manager, Store Operations.
            ["10043"] = new WeeklyRota(
                "Store Operations",
                new Dictionary<DayOfWeek, ShiftHours>
                {
                    [DayOfWeek.Monday] = Hours(8, 0, 17, 0),
                    [DayOfWeek.Tuesday] = Hours(8, 0, 17, 0),
                    [DayOfWeek.Thursday] = Hours(8, 0, 17, 0),
                    [DayOfWeek.Friday] = Hours(12, 0, 21, 0),
                    [DayOfWeek.Saturday] = Hours(9, 0, 18, 0),
                }),

            // Priya Raman — Receiving Associate, Receiving. Early starts for the morning deliveries.
            ["10044"] = new WeeklyRota(
                "Receiving",
                new Dictionary<DayOfWeek, ShiftHours>
                {
                    [DayOfWeek.Tuesday] = Hours(6, 0, 14, 30),
                    [DayOfWeek.Wednesday] = Hours(6, 0, 14, 30),
                    [DayOfWeek.Thursday] = Hours(6, 0, 14, 30),
                    [DayOfWeek.Friday] = Hours(6, 0, 14, 30),
                    [DayOfWeek.Saturday] = Hours(5, 30, 14, 0),
                }),

            // Chris Bell — Associate (Customer Support), Grocery. Afternoons and the weekend.
            ["10045"] = new WeeklyRota(
                "Grocery",
                new Dictionary<DayOfWeek, ShiftHours>
                {
                    [DayOfWeek.Sunday] = Hours(10, 0, 18, 0),
                    [DayOfWeek.Wednesday] = Hours(13, 0, 21, 0),
                    [DayOfWeek.Thursday] = Hours(13, 0, 21, 0),
                    [DayOfWeek.Friday] = Hours(13, 0, 21, 0),
                    [DayOfWeek.Saturday] = Hours(10, 0, 18, 0),
                }),
        });

    private static ShiftHours Hours(int startHour, int startMinute, int endHour, int endMinute) =>
        new(new TimeOnly(startHour, startMinute), new TimeOnly(endHour, endMinute));
}

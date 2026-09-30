using System;
using System.Globalization;
using System.Text.Json.Serialization;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// One day of the calling employee's schedule: a shift with its time range, or a day off.
/// </summary>
/// <remarks>
/// A day off has <see cref="DayOff"/> set and no time range at all. <see cref="Start"/> and
/// <see cref="End"/> are sent as <c>null</c> rather than left out, so every entry has the same
/// keys and a consumer branches on <see cref="DayOff"/> alone.
/// </remarks>
public sealed class ScheduledShiftResponse
{
    /// <summary>The date, as an ISO 8601 calendar date (<c>yyyy-MM-dd</c>).</summary>
    [JsonPropertyName("date")]
    public required string Date { get; init; }

    /// <summary>The day of the week the date falls on, by name (<c>Monday</c>).</summary>
    /// <remarks>
    /// The name, not a display label. Words like "Today" or "Tomorrow" depend on when and where
    /// the entry is shown, so they are the client's to choose.
    /// </remarks>
    [JsonPropertyName("day")]
    public required string Day { get; init; }

    /// <summary>The department the employee is scheduled in.</summary>
    [JsonPropertyName("department")]
    public required string Department { get; init; }

    /// <summary>Whether this is a scheduled day off rather than a shift.</summary>
    [JsonPropertyName("dayOff")]
    public required bool DayOff { get; init; }

    /// <summary>When the shift starts, as 24-hour <c>HH:mm</c>; <c>null</c> on a day off.</summary>
    [JsonPropertyName("start")]
    public required string? Start { get; init; }

    /// <summary>When the shift ends, as 24-hour <c>HH:mm</c>; <c>null</c> on a day off.</summary>
    [JsonPropertyName("end")]
    public required string? End { get; init; }

    /// <summary>Maps one scheduled day onto the wire shape.</summary>
    /// <param name="shift">The scheduled day.</param>
    /// <returns>One entry of the response body's <c>data</c> list.</returns>
    public static ScheduledShiftResponse From(ScheduledShift shift)
    {
        ArgumentNullException.ThrowIfNull(shift);

        return new()
        {
            Date = shift.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            Day = shift.Day.ToString(),
            Department = shift.Department,
            DayOff = shift.IsDayOff,
            Start = shift.Hours?.Start.ToString("HH:mm", CultureInfo.InvariantCulture),
            End = shift.Hours?.End.ToString("HH:mm", CultureInfo.InvariantCulture),
        };
    }
}

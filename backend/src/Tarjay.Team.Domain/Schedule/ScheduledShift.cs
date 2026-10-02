using System;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// One day of an employee's schedule: either a shift they are scheduled to work, with its hours,
/// or a scheduled day off.
/// </summary>
/// <remarks>
/// <para>
/// A day off is its own kind of entry, not a shift with empty hours. It has no time range at all,
/// so nothing reading it can mistake it for a zero-length shift. Build one through
/// <see cref="Worked"/> or <see cref="DayOff"/>. The two factories are the only way in, so the two
/// kinds can't be mixed up.
/// </para>
/// <para>
/// Informational only. Being scheduled to work is never the same as being on shift. People call
/// out, come in late, and leave early, so nothing derives shift status from this.
/// </para>
/// </remarks>
public sealed record ScheduledShift
{
    private ScheduledShift(DateOnly date, string department, ShiftHours? hours)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(department);

        Date = date;
        Department = department;
        Hours = hours;
    }

    /// <summary>The calendar date this entry is for.</summary>
    public DateOnly Date { get; }

    /// <summary>The day of the week <see cref="Date"/> falls on.</summary>
    public DayOfWeek Day => Date.DayOfWeek;

    /// <summary>The department the employee is scheduled in.</summary>
    public string Department { get; }

    /// <summary>The scheduled time range, or <see langword="null"/> on a day off.</summary>
    public ShiftHours? Hours { get; }

    /// <summary>Whether this is a scheduled day off rather than a shift.</summary>
    public bool IsDayOff => Hours is null;

    /// <summary>A day the employee is scheduled to work.</summary>
    /// <param name="date">The date of the shift.</param>
    /// <param name="department">The department the employee is scheduled in.</param>
    /// <param name="hours">When the shift starts and ends.</param>
    /// <returns>A worked-shift entry.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="hours"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="department"/> is blank.</exception>
    public static ScheduledShift Worked(DateOnly date, string department, ShiftHours hours)
    {
        ArgumentNullException.ThrowIfNull(hours);

        return new ScheduledShift(date, department, hours);
    }

    /// <summary>A scheduled day off.</summary>
    /// <param name="date">The date of the day off.</param>
    /// <param name="department">The employee's department, which a day off still belongs to.</param>
    /// <returns>A day-off entry, carrying no time range.</returns>
    /// <exception cref="ArgumentException"><paramref name="department"/> is blank.</exception>
    public static ScheduledShift DayOff(DateOnly date, string department) =>
        new(date, department, hours: null);
}

using System;
using System.Collections.Generic;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// An employee's repeating week: the department they work in, and the hours they are scheduled on
/// each day they work. Every day not listed is a day off.
/// </summary>
/// <remarks>
/// A rota is kept rather than a list of dated shifts so the seed never goes stale. The same
/// week projects onto whatever dates are around today, so every demo sign-in has a real schedule
/// on any day the app is run.
/// </remarks>
public sealed class WeeklyRota
{
    private readonly Dictionary<DayOfWeek, ShiftHours> _workingDays;

    /// <summary>Creates a rota.</summary>
    /// <param name="department">The department the employee is scheduled in.</param>
    /// <param name="workingDays">The hours for each day the employee works. Any day left out is a day off.</param>
    /// <exception cref="ArgumentNullException"><paramref name="workingDays"/> is null.</exception>
    /// <exception cref="ArgumentException">
    /// <paramref name="department"/> is blank, or <paramref name="workingDays"/> names a day that
    /// is not a day of the week or gives a day null hours.
    /// </exception>
    public WeeklyRota(string department, IReadOnlyDictionary<DayOfWeek, ShiftHours> workingDays)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(department);
        ArgumentNullException.ThrowIfNull(workingDays);

        _workingDays = [];

        foreach (KeyValuePair<DayOfWeek, ShiftHours> workingDay in workingDays)
        {
            if (!Enum.IsDefined(workingDay.Key))
            {
                throw new ArgumentException(
                    $"{(int)workingDay.Key} is not a day of the week.", nameof(workingDays));
            }

            if (workingDay.Value is null)
            {
                throw new ArgumentException(
                    $"{workingDay.Key} is listed as a working day but has no hours.", nameof(workingDays));
            }

            _workingDays[workingDay.Key] = workingDay.Value;
        }

        Department = department;
    }

    /// <summary>The department the employee is scheduled in.</summary>
    public string Department { get; }

    /// <summary>What this rota schedules on <paramref name="date"/>.</summary>
    /// <param name="date">The date to project the rota onto.</param>
    /// <returns>A worked shift if the rota works that day of the week, otherwise a day off.</returns>
    public ScheduledShift ShiftOn(DateOnly date) =>
        _workingDays.TryGetValue(date.DayOfWeek, out ShiftHours? hours)
            ? ScheduledShift.Worked(date, Department, hours)
            : ScheduledShift.DayOff(date, Department);
}

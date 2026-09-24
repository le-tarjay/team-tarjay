using System.Collections.Generic;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// Read-only access to employees' schedules: the shifts they are scheduled to work and the days
/// they are scheduled off.
/// </summary>
/// <remarks>
/// <para>
/// Read-only by design. Building or editing the schedule is out of scope, so nothing here writes.
/// </para>
/// <para>
/// Informational only, and isolated from attendance in both directions. Nothing here reads
/// attendance, and attendance reads nothing here. Being scheduled to work never makes anyone on
/// shift, and clocking in never changes what the schedule says.
/// </para>
/// </remarks>
public interface IScheduleStore
{
    /// <summary>
    /// Every day of the employee's schedule inside <see cref="ScheduleWindow"/> around today,
    /// oldest first, one entry per day: a worked shift or a day off.
    /// </summary>
    /// <param name="employeeId">The Employee ID to read the schedule for.</param>
    /// <returns>
    /// The employee's days in date order, or an empty list for an employee who has no schedule.
    /// </returns>
    /// <remarks>
    /// The window starts before today on purpose. A view of the current calendar week has to show
    /// the days of that week that have already passed, whichever day the week starts on.
    /// </remarks>
    public IReadOnlyList<ScheduledShift> GetShifts(string employeeId);
}

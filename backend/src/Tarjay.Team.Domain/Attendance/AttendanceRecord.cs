using System;
using System.Collections.Generic;
using System.Linq;

namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// One clock-in-to-clock-out cycle for one employee: when they clocked in, when they clocked out
/// if they have, and the breaks taken in between.
/// </summary>
/// <remarks>
/// <para>
/// A record with no clock-out time is <em>active</em>, and an employee has at most one of those at
/// a time. A clocked-out record is <em>completed</em>: it is kept, but it never decides what the
/// employee's status is now. An employee can run any number of cycles in a day.
/// </para>
/// <para>
/// Immutable. The store holds these behind a lock and hands them out to readers, so a record a
/// reader is holding cannot change underneath it.
/// </para>
/// </remarks>
public sealed class AttendanceRecord
{
    /// <summary>Creates a record, rejecting any shape an attendance cycle cannot actually take.</summary>
    /// <param name="employeeId">The Employee ID the record belongs to.</param>
    /// <param name="clockedInAt">When the employee clocked in.</param>
    /// <param name="clockedOutAt">When the employee clocked out, or <see langword="null"/> while the shift is running.</param>
    /// <param name="breaks">The breaks taken, oldest first. Only the latest may still be open.</param>
    /// <exception cref="ArgumentException">
    /// <paramref name="employeeId"/> is blank; a break other than the latest is open; or the
    /// record is clocked out with a break still open.
    /// </exception>
    public AttendanceRecord(
        string employeeId,
        DateTimeOffset clockedInAt,
        DateTimeOffset? clockedOutAt = null,
        IEnumerable<BreakInterval>? breaks = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);

        BreakInterval[] breakList = breaks?.ToArray() ?? [];

        if (breakList.Any(interval => interval is null))
        {
            throw new ArgumentException("A break interval cannot be null.", nameof(breaks));
        }

        // A second break cannot start while the first is still running, so an open break that is
        // not the latest one describes something that did not happen.
        if (breakList.SkipLast(1).Any(interval => interval.IsOpen))
        {
            throw new ArgumentException("Only the latest break can still be open.", nameof(breaks));
        }

        // Clocking out ends the shift, and a break is part of the shift.
        if (clockedOutAt is not null && breakList.Length > 0 && breakList[^1].IsOpen)
        {
            throw new ArgumentException("A clocked-out record cannot have a break still open.", nameof(breaks));
        }

        EmployeeId = employeeId;
        ClockedInAt = clockedInAt;
        ClockedOutAt = clockedOutAt;
        Breaks = breakList;
    }

    /// <summary>The Employee ID the record belongs to.</summary>
    public string EmployeeId { get; }

    /// <summary>When the employee clocked in.</summary>
    public DateTimeOffset ClockedInAt { get; }

    /// <summary>When the employee clocked out, or <see langword="null"/> while the shift is running.</summary>
    public DateTimeOffset? ClockedOutAt { get; }

    /// <summary>The breaks taken during this cycle, oldest first.</summary>
    public IReadOnlyList<BreakInterval> Breaks { get; }

    /// <summary>Whether the shift this record describes is still running.</summary>
    public bool IsActive => ClockedOutAt is null;

    /// <summary>Whether the employee is on a break right now, within this record.</summary>
    public bool IsOnBreak => IsActive && Breaks.Count > 0 && Breaks[^1].IsOpen;
}

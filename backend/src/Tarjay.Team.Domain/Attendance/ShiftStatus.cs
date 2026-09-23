namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// Where an employee stands with respect to their shift. Always exactly one of these three, and
/// tracked apart from whether the employee is signed in: signing out does not end a shift, and
/// clocking out does not sign anyone out.
/// </summary>
/// <remarks>
/// Derived only from the employee's attendance record, never from the schedule. Being scheduled to
/// work says nothing about whether someone actually clocked in.
/// </remarks>
public enum ShiftStatus
{
    /// <summary>No active clock-in record. Includes an employee who clocked in and out earlier today.</summary>
    OffShift,

    /// <summary>Clocked in and not on break.</summary>
    OnShift,

    /// <summary>
    /// Clocked in, with a break that has started and not yet ended. A sub-state of being clocked
    /// in, not a sibling of being off shift: the shift is still running.
    /// </summary>
    OnBreak,
}

/// <summary>
/// Facts that follow from a <see cref="ShiftStatus"/>, stated once so every reader agrees on them.
/// </summary>
public static class ShiftStatusExtensions
{
    /// <summary>
    /// Whether an employee in this status is on duty: clocked in and not on break.
    /// </summary>
    /// <param name="status">The employee's current shift status.</param>
    /// <returns><see langword="true"/> for <see cref="ShiftStatus.OnShift"/> only.</returns>
    /// <remarks>
    /// One definition with two readers — the navigation gate today, and manager-approval
    /// eligibility later — so neither re-derives it and the two cannot drift apart.
    /// </remarks>
    public static bool IsOnDuty(this ShiftStatus status) => status == ShiftStatus.OnShift;
}

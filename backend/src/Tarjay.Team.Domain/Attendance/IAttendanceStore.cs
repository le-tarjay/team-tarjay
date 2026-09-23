namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// Store-owned attendance: each employee's clock-in records, and the shift status that follows
/// from them.
/// </summary>
/// <remarks>
/// <para>
/// Every member takes the Employee ID it is asked about rather than assuming the caller. That is
/// deliberate. The shift-status endpoint only ever passes the calling employee's own ID, but a
/// later reader — manager-approval eligibility — needs to ask whether a <em>given</em> manager is
/// on duty, which is a different question against the same data. Shaping the interface for that
/// now costs a parameter; reopening it later would cost a change to every implementation.
/// </para>
/// <para>
/// Nothing here reads the schedule, and the schedule reads nothing here. On duty is never derived
/// from being scheduled.
/// </para>
/// </remarks>
public interface IAttendanceStore
{
    /// <summary>The employee's current shift status.</summary>
    /// <param name="employeeId">The Employee ID to ask about.</param>
    /// <returns>
    /// <see cref="ShiftStatus.OffShift"/> when the employee has no active record, whatever
    /// completed records they have; otherwise <see cref="ShiftStatus.OnBreak"/> if the active
    /// record's latest break is open, and <see cref="ShiftStatus.OnShift"/> if not.
    /// </returns>
    public ShiftStatus GetShiftStatus(string employeeId);

    /// <summary>Whether the employee is on duty right now: clocked in and not on break.</summary>
    /// <param name="employeeId">The Employee ID to ask about — any employee, not only the caller.</param>
    /// <returns><see langword="true"/> only when the employee's status is <see cref="ShiftStatus.OnShift"/>.</returns>
    public bool IsOnDuty(string employeeId);
}

namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// Store-owned attendance: each employee's clock-in records, and the shift status that follows
/// from them.
/// </summary>
/// <remarks>
/// <para>
/// Every member takes the Employee ID it is asked about rather than assuming the caller. That is
/// deliberate. The attendance endpoints only ever pass the calling employee's own ID, but a
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

    /// <summary>
    /// Clocks the employee in: off shift to on shift, starting a new active record stamped now.
    /// </summary>
    /// <param name="employeeId">The Employee ID to clock in.</param>
    /// <returns><see cref="ShiftStatus.OnShift"/>, the status the employee is now in.</returns>
    /// <exception cref="ShiftTransitionRejectedException">
    /// The employee already has an active record — on shift or on break. Nothing is changed.
    /// </exception>
    public ShiftStatus ClockIn(string employeeId);

    /// <summary>
    /// Clocks the employee out: on shift or on break to off shift, closing the active record now.
    /// A break still running is ended at the same moment, because a break is part of the shift.
    /// </summary>
    /// <param name="employeeId">The Employee ID to clock out.</param>
    /// <returns><see cref="ShiftStatus.OffShift"/>, the status the employee is now in.</returns>
    /// <exception cref="ShiftTransitionRejectedException">
    /// The employee is already off shift. Nothing is changed.
    /// </exception>
    public ShiftStatus ClockOut(string employeeId);

    /// <summary>Starts a break: on shift to on break, opening a break on the active record now.</summary>
    /// <param name="employeeId">The Employee ID starting a break.</param>
    /// <returns><see cref="ShiftStatus.OnBreak"/>, the status the employee is now in.</returns>
    /// <exception cref="ShiftTransitionRejectedException">
    /// The employee is off shift, or already on break. Nothing is changed.
    /// </exception>
    public ShiftStatus StartBreak(string employeeId);

    /// <summary>
    /// Ends a break: on break straight back to on shift, closing the open break now. Never passes
    /// through off shift — the active record stays active throughout.
    /// </summary>
    /// <param name="employeeId">The Employee ID ending a break.</param>
    /// <returns><see cref="ShiftStatus.OnShift"/>, the status the employee is now in.</returns>
    /// <exception cref="ShiftTransitionRejectedException">
    /// The employee is not on break — off shift, or on shift with no break running. Nothing is
    /// changed.
    /// </exception>
    public ShiftStatus EndBreak(string employeeId);
}

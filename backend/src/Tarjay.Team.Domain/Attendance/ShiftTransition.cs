namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// The four things an employee can do to their own shift status. Each is allowed from some
/// statuses and rejected from the rest; none of them touches whether the employee is signed in.
/// </summary>
public enum ShiftTransition
{
    /// <summary>Off shift to on shift: starts a new attendance record.</summary>
    ClockIn,

    /// <summary>On shift or on break to off shift: ends the active attendance record.</summary>
    ClockOut,

    /// <summary>On shift to on break: opens a break on the active record.</summary>
    StartBreak,

    /// <summary>On break straight back to on shift, never through off shift: closes the open break.</summary>
    EndBreak,
}

using System;

namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// A shift transition was asked for from a status it cannot start from — clocking in while
/// already clocked in, ending a break that was never started, and so on.
/// </summary>
/// <remarks>
/// <para>
/// A rejection, never a silent no-op. Treating a repeated clock-in as idempotent would tell the
/// caller the action worked when nothing happened, and a client that had drifted from the server's
/// status would never find out. Throwing is what lets the caller see the disagreement and re-read
/// the status the store actually holds.
/// </para>
/// <para>
/// Carries no HTTP status code or any other framework concern. Which status a rejection deserves
/// is decided entirely on the handler side, in the API layer.
/// </para>
/// </remarks>
public sealed class ShiftTransitionRejectedException : Exception
{
    /// <summary>Initializes the exception, naming what was attempted and from where.</summary>
    /// <param name="transition">The transition that was asked for.</param>
    /// <param name="currentStatus">The employee's status when it was asked for, which is unchanged.</param>
    public ShiftTransitionRejectedException(ShiftTransition transition, ShiftStatus currentStatus)
        : base(DescribeRejection(transition, currentStatus))
    {
        Transition = transition;
        CurrentStatus = currentStatus;
    }

    /// <summary>The transition that was asked for and refused.</summary>
    public ShiftTransition Transition { get; }

    /// <summary>The employee's status, which the rejection left exactly as it was.</summary>
    public ShiftStatus CurrentStatus { get; }

    // Plain sentences, because the handler surfaces this as the problem's detail. Every part of it
    // is a fixed phrase chosen from two enums, so nothing a caller sent can reach the message.
    private static string DescribeRejection(ShiftTransition transition, ShiftStatus currentStatus)
    {
        string attempted = transition switch
        {
            ShiftTransition.ClockIn => "clock in",
            ShiftTransition.ClockOut => "clock out",
            ShiftTransition.StartBreak => "start a break",
            ShiftTransition.EndBreak => "end a break",
            _ => "change shift status",
        };

        string current = currentStatus switch
        {
            ShiftStatus.OffShift => "off shift",
            ShiftStatus.OnShift => "on shift",
            ShiftStatus.OnBreak => "on break",
            _ => "in an unrecognized shift status",
        };

        return $"Cannot {attempted}: the employee is {current}.";
    }
}

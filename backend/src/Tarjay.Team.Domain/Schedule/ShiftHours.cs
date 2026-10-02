using System;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// The time range of one scheduled working day: when the shift is meant to start and end.
/// </summary>
/// <remarks>
/// Scheduled, not worked. These are the hours someone is expected in, which says nothing about
/// whether they clocked in. A scheduled shift starts and ends on the same day; nothing in the
/// store's rota crosses midnight, so a range that does is rejected rather than half-supported.
/// </remarks>
public sealed record ShiftHours
{
    /// <summary>Creates a time range, rejecting one that does not end after it starts.</summary>
    /// <param name="start">When the shift is scheduled to start.</param>
    /// <param name="end">When the shift is scheduled to end, later the same day.</param>
    /// <exception cref="ArgumentException"><paramref name="end"/> is not after <paramref name="start"/>.</exception>
    public ShiftHours(TimeOnly start, TimeOnly end)
    {
        if (end <= start)
        {
            throw new ArgumentException(
                $"A scheduled shift must end after it starts on the same day; {start:HH:mm} to {end:HH:mm} does not.",
                nameof(end));
        }

        Start = start;
        End = end;
    }

    /// <summary>When the shift is scheduled to start.</summary>
    public TimeOnly Start { get; }

    /// <summary>When the shift is scheduled to end.</summary>
    public TimeOnly End { get; }
}

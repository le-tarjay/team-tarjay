using System;

namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// One break taken during a shift: when it started, and when it ended if it has.
/// </summary>
/// <param name="StartedAt">When the break started.</param>
/// <param name="EndedAt">When the break ended, or <see langword="null"/> while it is still running.</param>
public sealed record BreakInterval(DateTimeOffset StartedAt, DateTimeOffset? EndedAt = null)
{
    /// <summary>Whether this break has started and not yet ended.</summary>
    public bool IsOpen => EndedAt is null;
}

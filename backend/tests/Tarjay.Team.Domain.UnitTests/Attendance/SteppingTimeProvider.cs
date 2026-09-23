using System;

namespace Tarjay.Team.Domain.UnitTests.Attendance;

/// <summary>
/// A clock these tests control: it starts where it is told to and moves only when advanced.
/// </summary>
/// <remarks>
/// Hand-rolled rather than taken from a testing package, because the store only ever asks it one
/// question — what time is it now — and that is one override.
/// </remarks>
internal sealed class SteppingTimeProvider(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now = _now.Add(by);
}

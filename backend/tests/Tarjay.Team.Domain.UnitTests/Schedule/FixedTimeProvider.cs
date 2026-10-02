using System;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

/// <summary>A clock stopped at one instant, in a time zone the test chooses.</summary>
/// <param name="now">The instant the clock always reads.</param>
/// <param name="localTimeZone">The clock's local time zone. Defaults to UTC.</param>
internal sealed class FixedTimeProvider(DateTimeOffset now, TimeZoneInfo? localTimeZone = null) : TimeProvider
{
    public override TimeZoneInfo LocalTimeZone { get; } = localTimeZone ?? TimeZoneInfo.Utc;

    public override DateTimeOffset GetUtcNow() => now.ToUniversalTime();
}

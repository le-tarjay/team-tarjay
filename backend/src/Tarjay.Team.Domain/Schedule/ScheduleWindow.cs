using System;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// The span of days a schedule read returns, measured from today.
/// </summary>
/// <remarks>
/// <para>
/// Two readers shape it. The full week view shows the current calendar week, so the window has
/// to reach back to that week's first day, however far back that is. Six days back covers it for
/// any first day of the week, which leaves the week-start convention to the client. The Home
/// preview rolls forward from today across the week boundary. Two weeks ahead is well beyond the
/// three worked shifts it shows, and still covers the rest of the current week.
/// </para>
/// <para>
/// Fixed rather than a query parameter. This is the whole schedule a client needs, and a fixed
/// span keeps the endpoint to one question with one answer.
/// </para>
/// </remarks>
public static class ScheduleWindow
{
    /// <summary>How many days before today the window starts.</summary>
    public const int DaysBeforeToday = 6;

    /// <summary>How many days after today the window ends, counting the last day.</summary>
    public const int DaysAfterToday = 13;

    /// <summary>How many days the window holds, today included.</summary>
    public const int Length = DaysBeforeToday + 1 + DaysAfterToday;

    /// <summary>The first day of the window around <paramref name="today"/>.</summary>
    /// <param name="today">The date the window is measured from.</param>
    /// <returns>The earliest date a schedule read covers.</returns>
    public static DateOnly FirstDay(DateOnly today) => today.AddDays(-DaysBeforeToday);

    /// <summary>The last day of the window around <paramref name="today"/>.</summary>
    /// <param name="today">The date the window is measured from.</param>
    /// <returns>The latest date a schedule read covers.</returns>
    public static DateOnly LastDay(DateOnly today) => today.AddDays(DaysAfterToday);
}

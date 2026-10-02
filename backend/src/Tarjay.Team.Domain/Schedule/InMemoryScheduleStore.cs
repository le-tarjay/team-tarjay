using System;
using System.Collections.Generic;

namespace Tarjay.Team.Domain.Schedule;

/// <summary>
/// In-memory <see cref="IScheduleStore"/>: a weekly rota per employee, projected onto the dates
/// around today. Registered as a singleton.
/// </summary>
/// <remarks>
/// <para>
/// Seeded, and permanently so. There is no database, and schedule authoring is out of scope, so
/// the rota never changes once the store is built. That same immutability is what makes it
/// thread-safe without a lock: nothing ever writes after construction, so concurrent readers have
/// nothing to race over.
/// </para>
/// <para>
/// Today comes from the injected <see cref="TimeProvider"/>, in its local time zone. That is the
/// store's own clock, since a schedule is the store's local calendar.
/// </para>
/// </remarks>
public sealed class InMemoryScheduleStore : IScheduleStore
{
    private readonly TimeProvider _timeProvider;
    private readonly Dictionary<string, WeeklyRota> _rotasByEmployee = new(StringComparer.Ordinal);

    /// <summary>Creates a store holding the demo roster's rotas, <see cref="ScheduleSeed.Rotas"/>.</summary>
    /// <param name="timeProvider">The clock that decides what today is.</param>
    /// <exception cref="ArgumentNullException"><paramref name="timeProvider"/> is null.</exception>
    public InMemoryScheduleStore(TimeProvider timeProvider)
        : this(timeProvider, ScheduleSeed.Rotas)
    {
    }

    /// <summary>Creates a store holding <paramref name="rotasByEmployee"/>.</summary>
    /// <param name="timeProvider">The clock that decides what today is.</param>
    /// <param name="rotasByEmployee">Each employee's rota, keyed on Employee ID.</param>
    /// <exception cref="ArgumentNullException">Either argument is null.</exception>
    /// <exception cref="ArgumentException">
    /// <paramref name="rotasByEmployee"/> has a blank Employee ID or a null rota.
    /// </exception>
    public InMemoryScheduleStore(TimeProvider timeProvider, IReadOnlyDictionary<string, WeeklyRota> rotasByEmployee)
    {
        ArgumentNullException.ThrowIfNull(timeProvider);
        ArgumentNullException.ThrowIfNull(rotasByEmployee);

        foreach (KeyValuePair<string, WeeklyRota> entry in rotasByEmployee)
        {
            if (string.IsNullOrWhiteSpace(entry.Key))
            {
                throw new ArgumentException("A rota must belong to an Employee ID.", nameof(rotasByEmployee));
            }

            if (entry.Value is null)
            {
                throw new ArgumentException(
                    $"Employee {entry.Key} is listed without a rota.", nameof(rotasByEmployee));
            }

            _rotasByEmployee[entry.Key] = entry.Value;
        }

        _timeProvider = timeProvider;
    }

    /// <inheritdoc />
    public IReadOnlyList<ScheduledShift> GetShifts(string employeeId)
    {
        ArgumentNullException.ThrowIfNull(employeeId);

        if (!_rotasByEmployee.TryGetValue(employeeId, out WeeklyRota? rota))
        {
            return [];
        }

        DateOnly firstDay = ScheduleWindow.FirstDay(Today());
        var shifts = new List<ScheduledShift>(ScheduleWindow.Length);

        for (int offset = 0; offset < ScheduleWindow.Length; offset++)
        {
            shifts.Add(rota.ShiftOn(firstDay.AddDays(offset)));
        }

        return shifts.AsReadOnly();
    }

    private DateOnly Today() => DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime);
}

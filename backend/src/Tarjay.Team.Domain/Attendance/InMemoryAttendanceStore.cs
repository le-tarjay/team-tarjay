using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;

namespace Tarjay.Team.Domain.Attendance;

/// <summary>
/// Thread-safe in-memory <see cref="IAttendanceStore"/>, keyed on Employee ID. Registered as a
/// singleton, so every register on the store's backend reads the same attendance.
/// </summary>
/// <remarks>
/// <para>
/// State lives for the life of the process. Attendance survives a corporate outage because the
/// store backend owns it, but a restart of the store backend itself clears every employee's
/// shift. That is accepted for this build, not a gap to close.
/// </para>
/// <para>
/// A plain <see cref="Lock"/> guards the collection rather than a concurrent dictionary. The clock
/// and break transitions are check-then-act — verify the current state, then change it — and one
/// mutual-exclusion lock expresses that more directly than compare-and-swap. Two registers racing
/// to clock the same employee in get one success and one rejection, never two active records.
/// Nothing awaited ever happens inside it.
/// </para>
/// <para>
/// Every timestamp comes from the store's own clock, never from a caller. Attendance is
/// store-owned, and the store is the authority on when a shift or a break started.
/// </para>
/// </remarks>
public sealed class InMemoryAttendanceStore : IAttendanceStore
{
    private readonly Lock _gate = new();

    private readonly TimeProvider _timeProvider;

    // Every record each employee has, active and completed alike. Completed records are retained
    // but never consulted for current status; only the one active record, if there is one, is.
    private readonly Dictionary<string, List<AttendanceRecord>> _recordsByEmployee =
        new(StringComparer.Ordinal);

    /// <summary>Creates an empty store on the system clock: every employee starts off shift.</summary>
    public InMemoryAttendanceStore()
        : this([])
    {
    }

    /// <summary>Creates a store on the system clock, already holding <paramref name="records"/>.</summary>
    /// <param name="records">Records to start from, active and completed, for any employees.</param>
    /// <exception cref="ArgumentException">
    /// <paramref name="records"/> contains a null, or more than one active record for one employee.
    /// </exception>
    public InMemoryAttendanceStore(IEnumerable<AttendanceRecord> records)
        : this(records, TimeProvider.System)
    {
    }

    /// <summary>
    /// Creates a store already holding <paramref name="records"/>, stamping transitions from
    /// <paramref name="timeProvider"/>.
    /// </summary>
    /// <param name="records">Records to start from, active and completed, for any employees.</param>
    /// <param name="timeProvider">The clock every clock-in, clock-out and break is stamped from.</param>
    /// <exception cref="ArgumentException">
    /// <paramref name="records"/> contains a null, or more than one active record for one employee.
    /// </exception>
    public InMemoryAttendanceStore(IEnumerable<AttendanceRecord> records, TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(records);
        ArgumentNullException.ThrowIfNull(timeProvider);

        _timeProvider = timeProvider;

        foreach (AttendanceRecord record in records)
        {
            if (record is null)
            {
                throw new ArgumentException("An attendance record cannot be null.", nameof(records));
            }

            if (!_recordsByEmployee.TryGetValue(record.EmployeeId, out List<AttendanceRecord>? existing))
            {
                existing = [];
                _recordsByEmployee[record.EmployeeId] = existing;
            }

            // One active record per employee is what makes their status a single answer.
            if (record.IsActive && existing.Any(held => held.IsActive))
            {
                throw new ArgumentException(
                    $"Employee {record.EmployeeId} cannot have more than one active attendance record.",
                    nameof(records));
            }

            existing.Add(record);
        }
    }

    /// <inheritdoc />
    public ShiftStatus GetShiftStatus(string employeeId)
    {
        ArgumentNullException.ThrowIfNull(employeeId);

        AttendanceRecord? active = FindActive(employeeId);

        if (active is null)
        {
            return ShiftStatus.OffShift;
        }

        return active.IsOnBreak ? ShiftStatus.OnBreak : ShiftStatus.OnShift;
    }

    /// <inheritdoc />
    public bool IsOnDuty(string employeeId) => GetShiftStatus(employeeId).IsOnDuty();

    /// <inheritdoc />
    public ShiftStatus ClockIn(string employeeId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);

        lock (_gate)
        {
            AttendanceRecord? active = FindActiveLocked(employeeId);

            if (active is not null)
            {
                throw new ShiftTransitionRejectedException(ShiftTransition.ClockIn, StatusOf(active));
            }

            if (!_recordsByEmployee.TryGetValue(employeeId, out List<AttendanceRecord>? records))
            {
                records = [];
                _recordsByEmployee[employeeId] = records;
            }

            records.Add(new AttendanceRecord(employeeId, _timeProvider.GetUtcNow()));

            return ShiftStatus.OnShift;
        }
    }

    /// <inheritdoc />
    public ShiftStatus ClockOut(string employeeId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);

        lock (_gate)
        {
            AttendanceRecord active = RequireActive(employeeId, ShiftTransition.ClockOut);
            DateTimeOffset now = _timeProvider.GetUtcNow();

            // Clocking out from a break ends the break too. A clocked-out record with a break still
            // open describes a shift that is over and a break that is not, which cannot happen.
            IEnumerable<BreakInterval> breaks = active.IsOnBreak
                ? [.. active.Breaks.SkipLast(1), active.Breaks[^1] with { EndedAt = now }]
                : active.Breaks;

            Replace(active, new AttendanceRecord(employeeId, active.ClockedInAt, now, breaks));

            return ShiftStatus.OffShift;
        }
    }

    /// <inheritdoc />
    public ShiftStatus StartBreak(string employeeId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);

        lock (_gate)
        {
            AttendanceRecord active = RequireActive(employeeId, ShiftTransition.StartBreak);

            if (active.IsOnBreak)
            {
                throw new ShiftTransitionRejectedException(ShiftTransition.StartBreak, ShiftStatus.OnBreak);
            }

            Replace(
                active,
                new AttendanceRecord(
                    employeeId,
                    active.ClockedInAt,
                    breaks: [.. active.Breaks, new BreakInterval(_timeProvider.GetUtcNow())]));

            return ShiftStatus.OnBreak;
        }
    }

    /// <inheritdoc />
    public ShiftStatus EndBreak(string employeeId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);

        lock (_gate)
        {
            AttendanceRecord active = RequireActive(employeeId, ShiftTransition.EndBreak);

            if (!active.IsOnBreak)
            {
                throw new ShiftTransitionRejectedException(ShiftTransition.EndBreak, ShiftStatus.OnShift);
            }

            // The record stays active — only the break closes — which is what returns the employee
            // straight to on shift rather than through off shift.
            Replace(
                active,
                new AttendanceRecord(
                    employeeId,
                    active.ClockedInAt,
                    breaks:
                    [
                        .. active.Breaks.SkipLast(1),
                        active.Breaks[^1] with { EndedAt = _timeProvider.GetUtcNow() },
                    ]));

            return ShiftStatus.OnShift;
        }
    }

    private static ShiftStatus StatusOf(AttendanceRecord active) =>
        active.IsOnBreak ? ShiftStatus.OnBreak : ShiftStatus.OnShift;

    private AttendanceRecord? FindActive(string employeeId)
    {
        lock (_gate)
        {
            return FindActiveLocked(employeeId);
        }
    }

    // Callers hold _gate. Split from FindActive so a transition can check and change the record
    // under one acquisition of the lock, not two with a gap between them.
    private AttendanceRecord? FindActiveLocked(string employeeId) =>
        _recordsByEmployee.TryGetValue(employeeId, out List<AttendanceRecord>? records)
            ? records.SingleOrDefault(record => record.IsActive)
            : null;

    // Callers hold _gate. Every transition but clock-in needs a shift already running, and is
    // rejected from off shift the same way.
    private AttendanceRecord RequireActive(string employeeId, ShiftTransition transition) =>
        FindActiveLocked(employeeId)
            ?? throw new ShiftTransitionRejectedException(transition, ShiftStatus.OffShift);

    // Callers hold _gate. Records are immutable, so a transition swaps the active record for its
    // successor in place — keeping it in the same position among the employee's other records.
    private void Replace(AttendanceRecord current, AttendanceRecord successor)
    {
        List<AttendanceRecord> records = _recordsByEmployee[current.EmployeeId];
        records[records.IndexOf(current)] = successor;
    }
}

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
/// A plain <see cref="Lock"/> guards the collection rather than a concurrent dictionary. Reading a
/// status is one lookup today, but the clock and break transitions that follow are
/// check-then-act — verify the current state, then change it — and one mutual-exclusion lock
/// expresses that more directly than compare-and-swap. Nothing awaited ever happens inside it.
/// </para>
/// </remarks>
public sealed class InMemoryAttendanceStore : IAttendanceStore
{
    private readonly Lock _gate = new();

    // Every record each employee has, active and completed alike. Completed records are retained
    // but never consulted for current status; only the one active record, if there is one, is.
    private readonly Dictionary<string, List<AttendanceRecord>> _recordsByEmployee =
        new(StringComparer.Ordinal);

    /// <summary>Creates an empty store: every employee starts off shift.</summary>
    public InMemoryAttendanceStore()
        : this([])
    {
    }

    /// <summary>Creates a store already holding <paramref name="records"/>.</summary>
    /// <param name="records">Records to start from, active and completed, for any employees.</param>
    /// <exception cref="ArgumentException">
    /// <paramref name="records"/> contains a null, or more than one active record for one employee.
    /// </exception>
    public InMemoryAttendanceStore(IEnumerable<AttendanceRecord> records)
    {
        ArgumentNullException.ThrowIfNull(records);

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

    private AttendanceRecord? FindActive(string employeeId)
    {
        lock (_gate)
        {
            return _recordsByEmployee.TryGetValue(employeeId, out List<AttendanceRecord>? records)
                ? records.SingleOrDefault(record => record.IsActive)
                : null;
        }
    }
}

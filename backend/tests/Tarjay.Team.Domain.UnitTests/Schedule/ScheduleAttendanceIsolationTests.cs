using System;
using System.Collections.Generic;
using System.Linq;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

/// <summary>
/// The schedule and attendance modules do not know about each other, in either direction.
/// </summary>
/// <remarks>
/// This is the epic's hard constraint. Being scheduled is informational only and never decides
/// shift status, and clocking in never changes the schedule. The tests read the compiled modules
/// rather than trusting a comment, so a later change that wires one into the other fails here
/// first.
/// </remarks>
public class ScheduleAttendanceIsolationTests
{
    private static readonly string s_scheduleNamespace = typeof(IScheduleStore).Namespace!;
    private static readonly string s_attendanceNamespace = typeof(IAttendanceStore).Namespace!;

    [Fact]
    public void ScheduleModule_ReferencesNothingInTheAttendanceModule()
    {
        // Arrange
        IEnumerable<Type> scheduleTypes = TypesIn(s_scheduleNamespace);

        // Act
        string[] offending = [.. Offenders(scheduleTypes, s_attendanceNamespace)];

        // Assert
        Assert.Empty(offending);
    }

    [Fact]
    public void AttendanceModule_ReferencesNothingInTheScheduleModule()
    {
        // Arrange
        IEnumerable<Type> attendanceTypes = TypesIn(s_attendanceNamespace);

        // Act
        string[] offending = [.. Offenders(attendanceTypes, s_scheduleNamespace)];

        // Assert
        Assert.Empty(offending);
    }

    [Fact]
    public void BothModules_HaveTypesToInspect()
    {
        // Arrange, Act, Assert — an empty namespace would pass both tests above without proving
        // anything, so each module has to actually be there.
        Assert.Contains(typeof(InMemoryScheduleStore), TypesIn(s_scheduleNamespace));
        Assert.Contains(typeof(InMemoryAttendanceStore), TypesIn(s_attendanceNamespace));
    }

    [Fact]
    public void TypeReferences_FindsAReferenceMadeOnlyInsideAMethodBody()
    {
        // Arrange — `ScheduleWindow` appears in no field, property, or signature of the store,
        // only in a call inside `GetShifts`. Finding it proves the method bodies are read, not
        // just the signatures.
        Type store = typeof(InMemoryScheduleStore);

        // Act
        IReadOnlySet<Type> references = TypeReferences.Of(store);

        // Assert
        Assert.Contains(typeof(ScheduleWindow), references);
    }

    private static IEnumerable<Type> TypesIn(string moduleNamespace) =>
        typeof(IScheduleStore).Assembly
            .GetTypes()
            .Where(type => type.Namespace == moduleNamespace);

    private static IEnumerable<string> Offenders(IEnumerable<Type> types, string forbiddenNamespace) =>
        from type in types
        from referenced in TypeReferences.Of(type)
        where referenced.Namespace == forbiddenNamespace
        select $"{type.FullName} -> {referenced.FullName}";
}

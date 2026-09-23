using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Domain.UnitTests.Attendance;

public class InMemoryAttendanceStoreTests
{
    private const string Employee = "10042";
    private const string AnotherEmployee = "10043";

    private static readonly DateTimeOffset s_morning = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void GetShiftStatus_WithNoAttendanceRecord_IsOffShift()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OffShift, status);
    }

    [Fact]
    public void GetShiftStatus_WithAnActiveRecordAndNoBreaks_IsOnShift()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnShift, status);
    }

    [Fact]
    public void GetShiftStatus_WithAnActiveRecordWhoseLatestBreakIsOpen_IsOnBreak()
    {
        // Arrange — an earlier break already over, and a second one still running.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(
                Employee,
                s_morning,
                breaks:
                [
                    new BreakInterval(s_morning.AddHours(2), s_morning.AddHours(2.25)),
                    new BreakInterval(s_morning.AddHours(4)),
                ]),
        ]);

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnBreak, status);
    }

    [Fact]
    public void GetShiftStatus_WithAnActiveRecordWhoseLatestBreakHasEnded_IsOnShiftNotOnBreak()
    {
        // Arrange — the break happened and is over, which returns the employee straight to on
        // shift rather than leaving them on break or taking them off shift.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(
                Employee,
                s_morning,
                breaks: [new BreakInterval(s_morning.AddHours(2), s_morning.AddHours(2.5))]),
        ]);

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnShift, status);
    }

    [Fact]
    public void GetShiftStatus_WithOnlyACompletedRecordFromEarlierToday_IsOffShift()
    {
        // Arrange — clocked in and out this morning, nothing since. The earlier record is still
        // held; it simply does not describe now.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(Employee, s_morning, clockedOutAt: s_morning.AddHours(4)),
        ]);

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OffShift, status);
    }

    [Fact]
    public void GetShiftStatus_WithSeveralCompletedCyclesAndOneActive_ReadsOnlyTheActiveRecord()
    {
        // Arrange — two completed cycles, one of which ended with breaks taken, and a third cycle
        // running now. Any number of cycles in a day, and only the running one counts.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(
                Employee,
                s_morning,
                clockedOutAt: s_morning.AddHours(2),
                breaks: [new BreakInterval(s_morning.AddHours(1), s_morning.AddHours(1.25))]),
            new AttendanceRecord(Employee, s_morning.AddHours(3), clockedOutAt: s_morning.AddHours(5)),
            new AttendanceRecord(Employee, s_morning.AddHours(6)),
        ]);

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnShift, status);
    }

    [Fact]
    public void GetShiftStatus_ForOneEmployee_IsNotAffectedByAnotherEmployeesRecord()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(AnotherEmployee, s_morning)]);

        // Act
        ShiftStatus status = store.GetShiftStatus(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OffShift, status);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(AnotherEmployee));
    }

    [Fact]
    public void GetShiftStatus_WithANullEmployeeId_Throws()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act / Assert
        Assert.Throws<ArgumentNullException>(() => store.GetShiftStatus(null!));
    }

    [Theory]
    [InlineData("10041")]
    [InlineData("10044")]
    [InlineData("10045")]
    public void IsOnDuty_AnswersForAnyEmployeeId_NotOnlyACaller(string employeeId)
    {
        // Arrange — three other employees in three different states, and the one asked about
        // on shift. The store is never told who is calling; it answers for whoever it is asked
        // about, which is the shape manager-approval eligibility will need.
        string[] others = Array.FindAll(["10041", "10044", "10045"], id => id != employeeId);
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(employeeId, s_morning),
            new AttendanceRecord(others[0], s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]),
            new AttendanceRecord(others[1], s_morning, clockedOutAt: s_morning.AddHours(1)),
        ]);

        // Act
        bool onDuty = store.IsOnDuty(employeeId);

        // Assert
        Assert.True(onDuty);
        Assert.False(store.IsOnDuty(others[0]));
        Assert.False(store.IsOnDuty(others[1]));
    }

    [Fact]
    public void IsOnDuty_WhenOnBreak_IsFalse()
    {
        // Arrange — still clocked in, but a break is not on-duty time.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]),
        ]);

        // Act
        bool onDuty = store.IsOnDuty(Employee);

        // Assert
        Assert.False(onDuty);
    }

    [Fact]
    public void IsOnDuty_WithNoRecord_IsFalse()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act
        bool onDuty = store.IsOnDuty(Employee);

        // Assert
        Assert.False(onDuty);
    }

    [Fact]
    public void IsOnDuty_WithANullEmployeeId_Throws()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act / Assert
        Assert.Throws<ArgumentNullException>(() => store.IsOnDuty(null!));
    }

    [Fact]
    public void Constructor_WithTwoActiveRecordsForOneEmployee_Throws()
    {
        // Arrange — two shifts running at once for one person is the shape that would make their
        // status two answers instead of one.
        AttendanceRecord[] records =
        [
            new AttendanceRecord(Employee, s_morning),
            new AttendanceRecord(Employee, s_morning.AddHours(1)),
        ];

        // Act / Assert
        ArgumentException failure = Assert.Throws<ArgumentException>(() => new InMemoryAttendanceStore(records));
        Assert.Contains(Employee, failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Constructor_WithOneActiveRecordEachForTwoEmployees_IsAccepted()
    {
        // Arrange / Act — the one-active-record rule is per employee, not per store.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(Employee, s_morning),
            new AttendanceRecord(AnotherEmployee, s_morning),
        ]);

        // Assert
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(AnotherEmployee));
    }

    [Fact]
    public void Constructor_WithNullRecords_Throws()
    {
        // Act / Assert
        Assert.Throws<ArgumentNullException>(() => new InMemoryAttendanceStore(null!));
    }

    [Fact]
    public void Constructor_WithANullRecordAmongThem_Throws()
    {
        // Arrange
        AttendanceRecord[] records = [new AttendanceRecord(Employee, s_morning), null!];

        // Act / Assert
        Assert.Throws<ArgumentException>(() => new InMemoryAttendanceStore(records));
    }

    [Fact]
    public void ClockIn_FromOffShift_IsOnShift()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act
        ShiftStatus result = store.ClockIn(Employee);

        // Assert — the answer returned, and the answer the store now gives anyone who asks.
        Assert.Equal(ShiftStatus.OnShift, result);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void ClockIn_AfterAnEarlierCompletedCycle_StartsANewShift()
    {
        // Arrange — clocked in and out this morning. Any number of cycles in a day.
        var store = new InMemoryAttendanceStore(
            [new AttendanceRecord(Employee, s_morning, clockedOutAt: s_morning.AddHours(4))]);

        // Act
        ShiftStatus result = store.ClockIn(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnShift, result);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void ClockIn_WhileOnShift_IsRejectedAndLeavesStatusUnchanged()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.ClockIn(Employee));

        // Assert — a real rejection, not an idempotent success, and nothing changed.
        Assert.Equal(ShiftTransition.ClockIn, rejection.Transition);
        Assert.Equal(ShiftStatus.OnShift, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void ClockIn_WhileOnBreak_IsRejectedAndLeavesStatusUnchanged()
    {
        // Arrange
        var store = new InMemoryAttendanceStore(
            [new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))])]);

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.ClockIn(Employee));

        // Assert
        Assert.Equal(ShiftStatus.OnBreak, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OnBreak, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void ClockOut_FromOnShift_IsOffShift()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);

        // Act
        ShiftStatus result = store.ClockOut(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OffShift, result);
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void ClockOut_FromOnBreak_IsOffShiftAndEndsTheBreak()
    {
        // Arrange — clocking out from a break is allowed, and ends the break with the shift.
        var store = new InMemoryAttendanceStore(
            [new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))])]);

        // Act
        ShiftStatus result = store.ClockOut(Employee);

        // Assert — off shift, and a fresh clock-in is on shift rather than landing back on a
        // break the earlier shift left open.
        Assert.Equal(ShiftStatus.OffShift, result);
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
        Assert.Equal(ShiftStatus.OnShift, store.ClockIn(Employee));
    }

    [Fact]
    public void ClockOut_WhileOffShift_IsRejected()
    {
        // Arrange — never clocked in.
        var store = new InMemoryAttendanceStore();

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.ClockOut(Employee));

        // Assert
        Assert.Equal(ShiftTransition.ClockOut, rejection.Transition);
        Assert.Equal(ShiftStatus.OffShift, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void ClockOut_Twice_IsRejectedTheSecondTime()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);
        store.ClockOut(Employee);

        // Act / Assert — the completed record from the first clock-out does not count as a shift
        // to clock out of.
        Assert.Throws<ShiftTransitionRejectedException>(() => store.ClockOut(Employee));
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void StartBreak_FromOnShift_IsOnBreak()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);

        // Act
        ShiftStatus result = store.StartBreak(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnBreak, result);
        Assert.Equal(ShiftStatus.OnBreak, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void StartBreak_AfterAnEarlierBreakEnded_IsOnBreakAgain()
    {
        // Arrange — one break already taken and over.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(
                Employee,
                s_morning,
                breaks: [new BreakInterval(s_morning.AddHours(1), s_morning.AddHours(1.25))]),
        ]);

        // Act
        ShiftStatus result = store.StartBreak(Employee);

        // Assert
        Assert.Equal(ShiftStatus.OnBreak, result);
    }

    [Fact]
    public void StartBreak_WhileOffShift_IsRejected()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.StartBreak(Employee));

        // Assert
        Assert.Equal(ShiftTransition.StartBreak, rejection.Transition);
        Assert.Equal(ShiftStatus.OffShift, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void StartBreak_WhileAlreadyOnBreak_IsRejected()
    {
        // Arrange
        var store = new InMemoryAttendanceStore(
            [new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))])]);

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.StartBreak(Employee));

        // Assert
        Assert.Equal(ShiftStatus.OnBreak, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OnBreak, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void EndBreak_FromOnBreak_IsOnShiftNotOffShift()
    {
        // Arrange
        var store = new InMemoryAttendanceStore(
            [new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))])]);

        // Act
        ShiftStatus result = store.EndBreak(Employee);

        // Assert — straight back to on shift. The shift that was running is still the one
        // running: a clock-in now is refused as on shift, which it would not be if ending the
        // break had closed the record and left the employee off shift.
        Assert.Equal(ShiftStatus.OnShift, result);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.ClockIn(Employee));
        Assert.Equal(ShiftStatus.OnShift, rejection.CurrentStatus);
    }

    [Fact]
    public void EndBreak_WhileOnShiftAndNotOnBreak_IsRejected()
    {
        // Arrange
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.EndBreak(Employee));

        // Assert
        Assert.Equal(ShiftTransition.EndBreak, rejection.Transition);
        Assert.Equal(ShiftStatus.OnShift, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void EndBreak_WhileOffShift_IsRejected()
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act
        ShiftTransitionRejectedException rejection =
            Assert.Throws<ShiftTransitionRejectedException>(() => store.EndBreak(Employee));

        // Assert
        Assert.Equal(ShiftStatus.OffShift, rejection.CurrentStatus);
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void Transitions_RunAFullShiftWithTwoBreaks()
    {
        // Arrange — the store's own clock, advanced between each step.
        var clock = new SteppingTimeProvider(s_morning);
        var store = new InMemoryAttendanceStore([], clock);

        // Act / Assert — every step lands exactly where the state machine says it should.
        Assert.Equal(ShiftStatus.OnShift, store.ClockIn(Employee));
        clock.Advance(TimeSpan.FromHours(2));
        Assert.Equal(ShiftStatus.OnBreak, store.StartBreak(Employee));
        clock.Advance(TimeSpan.FromMinutes(15));
        Assert.Equal(ShiftStatus.OnShift, store.EndBreak(Employee));
        clock.Advance(TimeSpan.FromHours(2));
        Assert.Equal(ShiftStatus.OnBreak, store.StartBreak(Employee));
        clock.Advance(TimeSpan.FromMinutes(30));
        Assert.Equal(ShiftStatus.OnShift, store.EndBreak(Employee));
        clock.Advance(TimeSpan.FromHours(3));
        Assert.Equal(ShiftStatus.OffShift, store.ClockOut(Employee));
        Assert.Equal(ShiftStatus.OffShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public void Transitions_ForOneEmployee_DoNotAffectAnother()
    {
        // Arrange — the other employee is mid-break.
        var store = new InMemoryAttendanceStore(
            [new AttendanceRecord(AnotherEmployee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))])]);

        // Act
        store.ClockIn(Employee);
        store.StartBreak(Employee);
        store.EndBreak(Employee);
        store.ClockOut(Employee);

        // Assert — still on the same break, untouched by four transitions on someone else.
        Assert.Equal(ShiftStatus.OnBreak, store.GetShiftStatus(AnotherEmployee));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Transitions_WithAMissingEmployeeId_Throw(string? employeeId)
    {
        // Arrange
        var store = new InMemoryAttendanceStore();

        // Act / Assert — a transition that names nobody cannot be recorded against anybody.
        Assert.ThrowsAny<ArgumentException>(() => store.ClockIn(employeeId!));
        Assert.ThrowsAny<ArgumentException>(() => store.ClockOut(employeeId!));
        Assert.ThrowsAny<ArgumentException>(() => store.StartBreak(employeeId!));
        Assert.ThrowsAny<ArgumentException>(() => store.EndBreak(employeeId!));
    }

    [Fact]
    public void Constructor_WithANullTimeProvider_Throws()
    {
        // Act / Assert
        Assert.Throws<ArgumentNullException>(() => new InMemoryAttendanceStore([], null!));
    }

    [Fact]
    public async Task ClockIn_RacedFromManyRegistersAtOnce_SucceedsExactlyOnce()
    {
        // Arrange — the same employee tapping clock-in on several registers at the same moment.
        var store = new InMemoryAttendanceStore();
        using var start = new ManualResetEventSlim();

        // Act
        Task<bool>[] attempts = new Task<bool>[32];
        for (int i = 0; i < attempts.Length; i++)
        {
            attempts[i] = Task.Run(() =>
            {
                start.Wait();

                try
                {
                    store.ClockIn(Employee);
                    return true;
                }
                catch (ShiftTransitionRejectedException)
                {
                    return false;
                }
            });
        }

        start.Set();
        bool[] results = await Task.WhenAll(attempts);

        // Assert — one shift, not several. The check and the change happen under one lock, so no
        // two attempts can both see off shift.
        Assert.Equal(1, results.Count(succeeded => succeeded));
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
        Assert.Throws<ShiftTransitionRejectedException>(() => store.ClockIn(Employee));
    }

    [Fact]
    public async Task EndBreak_ObservedConcurrently_NeverPassesThroughOffShift()
    {
        // Arrange — an employee taking and ending breaks over and over, while other registers
        // read their status as fast as they can.
        var store = new InMemoryAttendanceStore([new AttendanceRecord(Employee, s_morning)]);
        using var done = new CancellationTokenSource();

        Task<bool>[] readers = new Task<bool>[4];
        for (int i = 0; i < readers.Length; i++)
        {
            readers[i] = Task.Run(() =>
            {
                bool sawOffShift = false;
                while (!done.IsCancellationRequested)
                {
                    sawOffShift |= store.GetShiftStatus(Employee) == ShiftStatus.OffShift;
                }

                return sawOffShift;
            });
        }

        // Act
        for (int i = 0; i < 2_000; i++)
        {
            store.StartBreak(Employee);
            store.EndBreak(Employee);
        }

        await done.CancelAsync();
        bool[] observations = await Task.WhenAll(readers);

        // Assert — no reader ever caught the employee off shift between a break and its end.
        Assert.All(observations, Assert.False);
        Assert.Equal(ShiftStatus.OnShift, store.GetShiftStatus(Employee));
    }

    [Fact]
    public async Task GetShiftStatus_ReadConcurrently_AnswersConsistently()
    {
        // Arrange — a singleton shared by every register, read from many requests at once.
        var store = new InMemoryAttendanceStore(
        [
            new AttendanceRecord(Employee, s_morning),
            new AttendanceRecord(AnotherEmployee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]),
        ]);

        // Act
        Task<(ShiftStatus Employee, ShiftStatus Another)>[] reads = new Task<(ShiftStatus, ShiftStatus)>[64];
        for (int i = 0; i < reads.Length; i++)
        {
            reads[i] = Task.Run(() => (store.GetShiftStatus(Employee), store.GetShiftStatus(AnotherEmployee)));
        }

        (ShiftStatus Employee, ShiftStatus Another)[] results = await Task.WhenAll(reads);

        // Assert
        Assert.All(results, result =>
        {
            Assert.Equal(ShiftStatus.OnShift, result.Employee);
            Assert.Equal(ShiftStatus.OnBreak, result.Another);
        });
    }
}

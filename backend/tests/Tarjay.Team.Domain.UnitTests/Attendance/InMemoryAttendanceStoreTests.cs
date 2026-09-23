using System;
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

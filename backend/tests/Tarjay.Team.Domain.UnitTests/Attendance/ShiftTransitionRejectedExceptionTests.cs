using System;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Domain.UnitTests.Attendance;

public class ShiftTransitionRejectedExceptionTests
{
    [Fact]
    public void Constructor_CarriesTheAttemptedTransitionAndTheUnchangedStatus()
    {
        // Arrange / Act
        var rejection = new ShiftTransitionRejectedException(ShiftTransition.ClockIn, ShiftStatus.OnBreak);

        // Assert — what the handler reads to tell the caller where they actually stand.
        Assert.Equal(ShiftTransition.ClockIn, rejection.Transition);
        Assert.Equal(ShiftStatus.OnBreak, rejection.CurrentStatus);
    }

    [Theory]
    [InlineData(ShiftTransition.ClockIn, ShiftStatus.OnShift, "Cannot clock in: the employee is on shift.")]
    [InlineData(ShiftTransition.ClockOut, ShiftStatus.OffShift, "Cannot clock out: the employee is off shift.")]
    [InlineData(ShiftTransition.StartBreak, ShiftStatus.OnBreak, "Cannot start a break: the employee is on break.")]
    [InlineData(ShiftTransition.EndBreak, ShiftStatus.OnShift, "Cannot end a break: the employee is on shift.")]
    public void Message_SaysWhatWasAttemptedAndWhereTheEmployeeStands(
        ShiftTransition transition,
        ShiftStatus status,
        string expected)
    {
        // Arrange / Act
        var rejection = new ShiftTransitionRejectedException(transition, status);

        // Assert — surfaced to the caller as the problem's detail, so it has to read as a sentence.
        Assert.Equal(expected, rejection.Message);
    }
}

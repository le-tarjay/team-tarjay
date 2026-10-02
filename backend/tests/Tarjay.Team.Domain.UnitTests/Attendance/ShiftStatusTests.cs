using System;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Domain.UnitTests.Attendance;

public class ShiftStatusTests
{
    [Fact]
    public void ShiftStatus_HasExactlyTheThreeStates()
    {
        // Arrange / Act
        string[] states = Enum.GetNames<ShiftStatus>();

        // Assert — off shift, on shift, on break, and never more than one at a time. A fourth
        // state appearing here is a business decision, so it should have to break a test to land.
        Assert.Equal(3, states.Length);
        Assert.Contains(nameof(ShiftStatus.OffShift), states);
        Assert.Contains(nameof(ShiftStatus.OnShift), states);
        Assert.Contains(nameof(ShiftStatus.OnBreak), states);
    }

    [Theory]
    [InlineData(ShiftStatus.OffShift, false)]
    [InlineData(ShiftStatus.OnShift, true)]
    [InlineData(ShiftStatus.OnBreak, false)]
    public void IsOnDuty_IsTrueForOnShiftOnly(ShiftStatus status, bool expected)
    {
        // Act
        bool onDuty = status.IsOnDuty();

        // Assert — on duty means clocked in and not on break.
        Assert.Equal(expected, onDuty);
    }
}

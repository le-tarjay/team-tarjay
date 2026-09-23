using System;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Domain.UnitTests.Schedule;

public class ShiftHoursTests
{
    [Fact]
    public void Constructor_WithAnEndAfterTheStart_KeepsBoth()
    {
        // Act
        var hours = new ShiftHours(new TimeOnly(9, 0), new TimeOnly(17, 30));

        // Assert
        Assert.Equal(new TimeOnly(9, 0), hours.Start);
        Assert.Equal(new TimeOnly(17, 30), hours.End);
    }

    [Theory]
    [InlineData(9, 0, 9, 0)]
    [InlineData(17, 0, 9, 0)]
    [InlineData(22, 0, 6, 0)]
    public void Constructor_WithAnEndNotAfterTheStart_Throws(int startHour, int startMinute, int endHour, int endMinute)
    {
        // Act, Assert — a zero-length shift, a backwards one, and one crossing midnight.
        Assert.Throws<ArgumentException>(() =>
            new ShiftHours(new TimeOnly(startHour, startMinute), new TimeOnly(endHour, endMinute)));
    }
}

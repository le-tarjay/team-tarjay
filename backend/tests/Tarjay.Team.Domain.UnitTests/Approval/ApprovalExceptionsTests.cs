using System;
using System.Collections.Generic;
using Tarjay.Team.Domain.Approval;

namespace Tarjay.Team.Domain.UnitTests.Approval;

public class ApprovalExceptionsTests
{
    [Fact]
    public void ApproverNotRecognized_DoesNotSayWhichFieldWasWrong()
    {
        // Arrange / Act
        var failure = new ApproverNotRecognizedException();

        // Assert — both fields named, so the message cannot narrow to one of them.
        Assert.Contains("Employee ID", failure.Message, StringComparison.Ordinal);
        Assert.Contains("PIN", failure.Message, StringComparison.Ordinal);
        Assert.Equal("The approving manager's Employee ID or PIN was not recognized.", failure.Message);
    }

    [Fact]
    public void ApproverNotEligible_SaysWhatAnApproverNeeds()
    {
        // Arrange / Act
        var failure = new ApproverNotEligibleException();

        // Assert
        Assert.Equal(
            "That manager can't approve this right now. They need to be clocked in, off break, and managing this department.",
            failure.Message);
    }

    [Fact]
    public void EveryApprovalFailure_SharesTheAggregatesBaseType()
    {
        // Arrange / Act
        var failures = new Exception[]
        {
            new ApproverNotRecognizedException(),
            new ApproverNotEligibleException(),
            new ApprovalCheckUnavailableException(),
        };

        // Assert
        Assert.All(failures, failure => Assert.IsAssignableFrom<ApprovalException>(failure));
    }

    [Fact]
    public void EachApprovalFailure_HasItsOwnMessage()
    {
        // Arrange / Act
        string[] messages =
        [
            new ApproverNotRecognizedException().Message,
            new ApproverNotEligibleException().Message,
            new ApprovalCheckUnavailableException().Message,
        ];

        // Assert
        Assert.Equal(messages.Length, new HashSet<string>(messages, StringComparer.Ordinal).Count);
    }
}

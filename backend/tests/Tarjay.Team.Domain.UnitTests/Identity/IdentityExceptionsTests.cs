using System;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Domain.UnitTests.Identity;

public class IdentityExceptionsTests
{
    [Fact]
    public void InvalidEmployeeCredentials_DoesNotSayWhichFieldWasWrong()
    {
        // Arrange / Act
        var failure = new InvalidEmployeeCredentialsException();

        // Assert — one message for both an unknown Employee ID and a wrong PIN, so a rejection
        // cannot be used to work out which Employee IDs exist. Both fields have to appear, which
        // is what rules out the message narrowing to just one of them: "The PIN is not valid."
        // would fail this, and so would "No such Employee ID."
        Assert.Contains("Employee ID", failure.Message, StringComparison.Ordinal);
        Assert.Contains("PIN", failure.Message, StringComparison.Ordinal);
        Assert.Equal("The Employee ID or PIN is not valid.", failure.Message);
    }

    [Fact]
    public void EveryIdentityFailure_SharesTheAggregatesBaseType()
    {
        // Arrange / Act
        var failures = new Exception[]
        {
            new InvalidEmployeeCredentialsException(),
            new IdentityProviderUnreachableException(),
            new EmployeeIdentityIncompleteException("no department was supplied"),
        };

        // Assert — what lets one handler claim this aggregate's failures and pass on everything else.
        Assert.All(failures, failure => Assert.IsAssignableFrom<IdentityException>(failure));
    }

    [Fact]
    public void EachIdentityFailure_IsADistinctType()
    {
        // Arrange / Act / Assert — the handler maps on type, and the epic requires a rejected
        // credential and an unreachable provider to be distinguishable by the caller.
        Assert.IsNotType<IdentityProviderUnreachableException>(new InvalidEmployeeCredentialsException());
        Assert.IsNotType<InvalidEmployeeCredentialsException>(new IdentityProviderUnreachableException());
        Assert.IsNotType<InvalidEmployeeCredentialsException>(
            new EmployeeIdentityIncompleteException("no department was supplied"));
    }

    [Fact]
    public void ProviderUnreachable_ExplainsHowItWasUnreachable()
    {
        // Arrange / Act
        var failure = new IdentityProviderUnreachableException("the request timed out");

        // Assert
        Assert.Contains("the request timed out", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ProviderUnreachable_KeepsTheUnderlyingTransportFailure()
    {
        // Arrange
        var transportFailure = new InvalidOperationException("Connection refused");

        // Act
        var failure = new IdentityProviderUnreachableException("the connection failed", transportFailure);

        // Assert — the cause survives for the logs, even though the caller never sees it.
        Assert.Same(transportFailure, failure.InnerException);
    }

    [Fact]
    public void IdentityIncomplete_NamesWhatTheProviderFailedToSupply()
    {
        // Arrange / Act
        var failure = new EmployeeIdentityIncompleteException("no department claim was supplied");

        // Assert
        Assert.Contains("no department claim was supplied", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void EmployeeIdentity_CarriesAllThreeAuthorityAxes()
    {
        // Arrange / Act — tier, department scope, and job function vary independently, so an
        // identity has to carry all three rather than deriving one from another.
        var identity = new EmployeeIdentity
        {
            EmployeeId = "100482",
            Name = "Avery Brooks",
            Role = EmployeeRole.ReceivingAssociate,
            Department = "Grocery",
            JobFunction = "Receiving",
        };

        // Assert
        Assert.Equal(EmployeeRole.ReceivingAssociate, identity.Role);
        Assert.Equal("Grocery", identity.Department);
        Assert.Equal("Receiving", identity.JobFunction);
    }

    [Fact]
    public void EmployeeRole_HasExactlyTheFourRolesTheStoreRecognizes()
    {
        // Arrange / Act
        var roles = Enum.GetNames<EmployeeRole>();

        // Assert — a fifth tier appearing here is a business decision, not a refactor, so it
        // should have to break a test to arrive.
        Assert.Equal(4, roles.Length);
        Assert.Contains(nameof(EmployeeRole.Associate), roles);
        Assert.Contains(nameof(EmployeeRole.DepartmentManager), roles);
        Assert.Contains(nameof(EmployeeRole.StoreManager), roles);
        Assert.Contains(nameof(EmployeeRole.ReceivingAssociate), roles);
    }
}

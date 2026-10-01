using System;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Domain.UnitTests.Identity;

public class ApproverCredentialCheckResultTests
{
    [Fact]
    public void Valid_CarriesTheIdentity()
    {
        // Arrange
        var identity = new EmployeeIdentity
        {
            EmployeeId = "20001",
            Name = "Jordan Lee",
            Role = EmployeeRole.DepartmentManager,
            Department = "Electronics",
            JobFunction = "Management",
        };

        // Act
        var result = ApproverCredentialCheckResult.Valid(identity);

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Valid, result.Outcome);
        Assert.Same(identity, result.Identity);
    }

    [Fact]
    public void Valid_WithNoIdentity_Throws()
    {
        // Act and assert
        Assert.Throws<ArgumentNullException>(() => ApproverCredentialCheckResult.Valid(null!));
    }

    [Fact]
    public void NotValid_CarriesNoIdentity()
    {
        // Act
        var result = ApproverCredentialCheckResult.NotValid();

        // Assert
        Assert.Equal(ApproverCredentialOutcome.NotValid, result.Outcome);
        Assert.Null(result.Identity);
    }

    [Fact]
    public void Unreachable_CarriesNoIdentityAndIsDistinctFromNotValid()
    {
        // Act
        var result = ApproverCredentialCheckResult.Unreachable();

        // Assert
        Assert.Equal(ApproverCredentialOutcome.Unreachable, result.Outcome);
        Assert.Null(result.Identity);
        Assert.NotEqual(ApproverCredentialCheckResult.NotValid().Outcome, result.Outcome);
    }
}

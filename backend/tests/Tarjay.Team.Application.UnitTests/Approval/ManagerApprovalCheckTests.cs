using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Moq;
using Tarjay.Team.Application.Approval;
using Tarjay.Team.Domain.Approval;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Application.UnitTests.Approval;

public class ManagerApprovalCheckTests
{
    private const string ManagerId = "20001";
    private const string Pin = "7395";
    private const string Grocery = "Grocery";

    private readonly Mock<IApproverCredentialCheck> _credentials = new(MockBehavior.Strict);
    private readonly Mock<IApprovalEligibility> _eligibility = new(MockBehavior.Strict);
    private readonly CapturingLogger<ManagerApprovalCheck> _logger = new();

    [Fact]
    public async Task CheckAsync_RecognizedAndEligibleManager_ReturnsTheApprover()
    {
        // Arrange
        EmployeeIdentity manager = Manager(EmployeeRole.DepartmentManager, Grocery);
        CredentialsAre(ApproverCredentialCheckResult.Valid(manager));
        _eligibility.Setup(rule => rule.CanApprove(manager, Grocery)).Returns(true);

        // Act
        EmployeeIdentity approver = await Check().CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None);

        // Assert
        Assert.Same(manager, approver);
        _credentials.Verify(check => check.CheckAsync(ManagerId, Pin, It.IsAny<CancellationToken>()), Times.Once);
        _eligibility.Verify(rule => rule.CanApprove(manager, Grocery), Times.Once);
    }

    [Fact]
    public async Task CheckAsync_PassesTheRequestDepartmentToTheEligibilityRule()
    {
        // Arrange — the manager's own department differs from the request's. The rule must be
        // asked about the request's.
        EmployeeIdentity manager = Manager(EmployeeRole.StoreManager, "Store Operations");
        CredentialsAre(ApproverCredentialCheckResult.Valid(manager));
        _eligibility.Setup(rule => rule.CanApprove(manager, "Electronics")).Returns(true);

        // Act
        await Check().CheckAsync(ManagerId, Pin, "Electronics", CancellationToken.None);

        // Assert
        _eligibility.Verify(rule => rule.CanApprove(manager, "Electronics"), Times.Once);
    }

    [Fact]
    public async Task CheckAsync_CredentialsNotValid_ThrowsNotRecognizedWithoutAskingEligibility()
    {
        // Arrange — one outcome covers an unknown Employee ID, a wrong PIN, and a lockout.
        CredentialsAre(ApproverCredentialCheckResult.NotValid());

        // Act / Assert
        await Assert.ThrowsAsync<ApproverNotRecognizedException>(
            () => Check().CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
        _eligibility.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CheckAsync_AuthorityUnreachable_ThrowsUnavailableWithoutAskingEligibility()
    {
        // Arrange
        CredentialsAre(ApproverCredentialCheckResult.Unreachable());

        // Act / Assert
        await Assert.ThrowsAsync<ApprovalCheckUnavailableException>(
            () => Check().CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
        _eligibility.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CheckAsync_RecognizedButNotEligible_ThrowsNotEligible()
    {
        // Arrange
        EmployeeIdentity manager = Manager(EmployeeRole.DepartmentManager, "Electronics");
        CredentialsAre(ApproverCredentialCheckResult.Valid(manager));
        _eligibility.Setup(rule => rule.CanApprove(manager, Grocery)).Returns(false);

        // Act / Assert
        await Assert.ThrowsAsync<ApproverNotEligibleException>(
            () => Check().CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
    }

    [Fact]
    public async Task CheckAsync_IdentityIncomplete_LetsTheIdentityFailureThrough()
    {
        // Arrange
        _credentials
            .Setup(check => check.CheckAsync(ManagerId, Pin, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new EmployeeIdentityIncompleteException("no tier was supplied"));

        // Act / Assert
        await Assert.ThrowsAsync<EmployeeIdentityIncompleteException>(
            () => Check().CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
        _eligibility.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CheckAsync_PassesTheCallersCancellationTokenToTheCredentialCheck()
    {
        // Arrange
        using var cancellation = new CancellationTokenSource();
        EmployeeIdentity manager = Manager(EmployeeRole.DepartmentManager, Grocery);
        _credentials
            .Setup(check => check.CheckAsync(ManagerId, Pin, cancellation.Token))
            .ReturnsAsync(ApproverCredentialCheckResult.Valid(manager));
        _eligibility.Setup(rule => rule.CanApprove(manager, Grocery)).Returns(true);

        // Act
        await Check().CheckAsync(ManagerId, Pin, Grocery, cancellation.Token);

        // Assert
        _credentials.Verify(check => check.CheckAsync(ManagerId, Pin, cancellation.Token), Times.Once);
    }

    [Fact]
    public async Task CheckAsync_EveryOutcome_NeverLogsThePin()
    {
        // Arrange
        EmployeeIdentity eligible = Manager(EmployeeRole.DepartmentManager, Grocery);
        EmployeeIdentity ineligible = Manager(EmployeeRole.DepartmentManager, "Electronics");
        _credentials
            .SetupSequence(check => check.CheckAsync(ManagerId, Pin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApproverCredentialCheckResult.Valid(eligible))
            .ReturnsAsync(ApproverCredentialCheckResult.NotValid())
            .ReturnsAsync(ApproverCredentialCheckResult.Unreachable())
            .ReturnsAsync(ApproverCredentialCheckResult.Valid(ineligible));
        _eligibility.Setup(rule => rule.CanApprove(eligible, Grocery)).Returns(true);
        _eligibility.Setup(rule => rule.CanApprove(ineligible, Grocery)).Returns(false);
        ManagerApprovalCheck check = Check();

        // Act
        await check.CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None);
        await Assert.ThrowsAsync<ApproverNotRecognizedException>(
            () => check.CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
        await Assert.ThrowsAsync<ApprovalCheckUnavailableException>(
            () => check.CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
        await Assert.ThrowsAsync<ApproverNotEligibleException>(
            () => check.CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));

        // Assert — every outcome logged once, by Employee ID, and the PIN in none of them.
        Assert.Equal(4, _logger.Lines.Count);
        Assert.All(_logger.Lines, line => Assert.Contains(ManagerId, line, StringComparison.Ordinal));
        Assert.False(_logger.ContainsText(Pin), "The PIN appeared in a log line.");
    }

    [Fact]
    public async Task CheckAsync_Refusals_LogAtWarningAndApprovalAtInformation()
    {
        // Arrange
        EmployeeIdentity manager = Manager(EmployeeRole.DepartmentManager, Grocery);
        _credentials
            .SetupSequence(check => check.CheckAsync(ManagerId, Pin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(ApproverCredentialCheckResult.NotValid())
            .ReturnsAsync(ApproverCredentialCheckResult.Valid(manager));
        _eligibility.Setup(rule => rule.CanApprove(manager, Grocery)).Returns(true);
        ManagerApprovalCheck check = Check();

        // Act
        await Assert.ThrowsAsync<ApproverNotRecognizedException>(
            () => check.CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None));
        await check.CheckAsync(ManagerId, Pin, Grocery, CancellationToken.None);

        // Assert
        Assert.StartsWith($"{LogLevel.Warning}:", _logger.Lines[0], StringComparison.Ordinal);
        Assert.StartsWith($"{LogLevel.Information}:", _logger.Lines[1], StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task CheckAsync_MissingEmployeeId_ThrowsBeforeCheckingCredentials(string? employeeId)
    {
        // Act / Assert
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => Check().CheckAsync(employeeId!, Pin, Grocery, CancellationToken.None));
        _credentials.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task CheckAsync_MissingPin_ThrowsBeforeCheckingCredentials(string? pin)
    {
        // Act / Assert
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => Check().CheckAsync(ManagerId, pin!, Grocery, CancellationToken.None));
        _credentials.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CheckAsync_NullRequestDepartment_ThrowsBeforeCheckingCredentials()
    {
        // Act / Assert
        await Assert.ThrowsAsync<ArgumentNullException>(
            () => Check().CheckAsync(ManagerId, Pin, null!, CancellationToken.None));
        _credentials.VerifyNoOtherCalls();
    }

    private ManagerApprovalCheck Check() => new(_credentials.Object, _eligibility.Object, _logger);

    private void CredentialsAre(ApproverCredentialCheckResult result) =>
        _credentials
            .Setup(check => check.CheckAsync(ManagerId, Pin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(result);

    private static EmployeeIdentity Manager(EmployeeRole role, string department) =>
        new()
        {
            EmployeeId = ManagerId,
            Name = "Jordan Lee",
            Role = role,
            Department = department,
            JobFunction = "Management",
        };
}

using System;

namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// The three ways an approver credential check can end.
/// </summary>
public enum ApproverCredentialOutcome
{
    /// <summary>The authority accepted the Employee ID and PIN.</summary>
    Valid,

    /// <summary>
    /// The authority refused the Employee ID and PIN. One outcome for an unknown Employee ID, a
    /// wrong PIN, and a manager the authority has locked out, so it never reveals which it was.
    /// </summary>
    NotValid,

    /// <summary>
    /// The check could not be completed because the authority could not be reached or did not
    /// answer usably. Says nothing about the credentials.
    /// </summary>
    Unreachable,
}

/// <summary>
/// What an <see cref="IApproverCredentialCheck"/> found.
/// </summary>
public sealed class ApproverCredentialCheckResult
{
    private static readonly ApproverCredentialCheckResult s_notValid = new(ApproverCredentialOutcome.NotValid, null);
    private static readonly ApproverCredentialCheckResult s_unreachable = new(ApproverCredentialOutcome.Unreachable, null);

    private ApproverCredentialCheckResult(ApproverCredentialOutcome outcome, EmployeeIdentity? identity)
    {
        Outcome = outcome;
        Identity = identity;
    }

    /// <summary>Which of the three outcomes this is.</summary>
    public ApproverCredentialOutcome Outcome { get; }

    /// <summary>
    /// Whose credentials they were. Set only when <see cref="Outcome"/> is
    /// <see cref="ApproverCredentialOutcome.Valid"/>, and <see langword="null"/> otherwise.
    /// </summary>
    public EmployeeIdentity? Identity { get; }

    /// <summary>The credentials were accepted and belong to <paramref name="identity"/>.</summary>
    /// <param name="identity">Whose credentials they were.</param>
    /// <returns>A <see cref="ApproverCredentialOutcome.Valid"/> result.</returns>
    public static ApproverCredentialCheckResult Valid(EmployeeIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(identity);

        return new ApproverCredentialCheckResult(ApproverCredentialOutcome.Valid, identity);
    }

    /// <summary>The credentials were refused.</summary>
    /// <returns>A <see cref="ApproverCredentialOutcome.NotValid"/> result.</returns>
    public static ApproverCredentialCheckResult NotValid() => s_notValid;

    /// <summary>The check could not be completed.</summary>
    /// <returns>An <see cref="ApproverCredentialOutcome.Unreachable"/> result.</returns>
    public static ApproverCredentialCheckResult Unreachable() => s_unreachable;
}

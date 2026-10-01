using System;

namespace Tarjay.Team.Domain.Approval;

/// <summary>
/// Base type for every way a manager approval check can be refused or fail. Carries no HTTP status
/// code or any other framework concern. Which status each one deserves is decided on the handler
/// side, in the API layer.
/// </summary>
/// <remarks>
/// Every message in this family is fixed text. None takes a caller-supplied string, so none can
/// carry a PIN into a log line or a response body.
/// </remarks>
public abstract class ApprovalException : Exception
{
    /// <summary>Initializes the exception with a message describing what went wrong.</summary>
    protected ApprovalException(string message)
        : base(message)
    {
    }
}

/// <summary>
/// The approving manager's Employee ID and PIN were not accepted by the identity authority.
/// </summary>
/// <remarks>
/// One exception for an unknown Employee ID, a wrong PIN, and a manager the authority has locked
/// out. A caller cannot tell the three apart, so a refusal never reveals which Employee IDs exist.
/// </remarks>
public sealed class ApproverNotRecognizedException : ApprovalException
{
    private const string DefaultMessage = "The approving manager's Employee ID or PIN was not recognized.";

    /// <summary>Initializes the exception with its fixed, non-revealing message.</summary>
    public ApproverNotRecognizedException()
        : base(DefaultMessage)
    {
    }
}

/// <summary>
/// The approving manager's credentials were good, but the eligibility rule does not let them
/// approve this request right now.
/// </summary>
/// <remarks>
/// Raised for a manager outside the request's department, a manager who is off shift or on break,
/// and an employee who holds no approval authority at all.
/// </remarks>
public sealed class ApproverNotEligibleException : ApprovalException
{
    private const string DefaultMessage =
        "That manager can't approve this right now. They need to be clocked in, off break, and managing this department.";

    /// <summary>Initializes the exception with its fixed message.</summary>
    public ApproverNotEligibleException()
        : base(DefaultMessage)
    {
    }
}

/// <summary>
/// The approval check could not be completed because the identity authority could not be reached.
/// Says nothing about the manager's credentials or eligibility.
/// </summary>
public sealed class ApprovalCheckUnavailableException : ApprovalException
{
    private const string DefaultMessage = "Approval couldn't be checked right now because the identity provider could not be reached.";

    /// <summary>Initializes the exception with its fixed message.</summary>
    public ApprovalCheckUnavailableException()
        : base(DefaultMessage)
    {
    }
}

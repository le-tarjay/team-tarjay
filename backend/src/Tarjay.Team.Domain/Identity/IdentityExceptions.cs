using System;

namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// Base type for every way resolving an employee's identity at sign-in can fail. Carries no HTTP
/// status code or any other framework concern — which status a given failure deserves is decided
/// entirely on the handler side, in the API layer.
/// </summary>
public abstract class IdentityException : Exception
{
    /// <summary>Initializes the exception with a message describing what went wrong.</summary>
    protected IdentityException(string message)
        : base(message)
    {
    }

    /// <summary>Initializes the exception with a message and the failure that caused it.</summary>
    protected IdentityException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// The Employee ID and PIN pair was not accepted by the identity authority.
/// </summary>
/// <remarks>
/// Deliberately one exception for both an unrecognized Employee ID and a recognized Employee ID
/// with the wrong PIN. The two are indistinguishable to a caller by design, so that a rejection
/// never reveals which of the two fields was wrong — and so that neither case can be used to probe
/// which Employee IDs exist. The message is fixed for the same reason, and because a
/// caller-supplied message on this type would be a route for a PIN to reach a log line.
/// </remarks>
public sealed class InvalidEmployeeCredentialsException : IdentityException
{
    private const string DefaultMessage = "The Employee ID or PIN is not valid.";

    /// <summary>Initializes the exception with its fixed, non-revealing message.</summary>
    public InvalidEmployeeCredentialsException()
        : base(DefaultMessage)
    {
    }

    /// <summary>Initializes the exception with its fixed message and the failure that caused it.</summary>
    public InvalidEmployeeCredentialsException(Exception innerException)
        : base(DefaultMessage, innerException)
    {
    }
}

/// <summary>
/// The identity authority could not be reached, so no sign-in can be resolved at all.
/// </summary>
/// <remarks>
/// A hard block, never a fallback: reachability of the authority is a precondition of signing in,
/// and there is no local credential cache and no offline grace period to fall back to. This is
/// strictly distinct from <see cref="InvalidEmployeeCredentialsException"/> — an authority that is
/// reachable and rejecting a credential is an invalid credential, not an unreachable authority.
/// </remarks>
public sealed class IdentityProviderUnreachableException : IdentityException
{
    private const string DefaultMessage = "The identity provider could not be reached, so sign-in is unavailable.";

    /// <summary>Initializes the exception with its default message.</summary>
    public IdentityProviderUnreachableException()
        : base(DefaultMessage)
    {
    }

    /// <summary>
    /// Initializes the exception, describing how the authority was unreachable.
    /// </summary>
    /// <param name="reason">
    /// What went wrong at the transport level, e.g. "the request timed out". Never contains a
    /// credential.
    /// </param>
    public IdentityProviderUnreachableException(string reason)
        : base($"{DefaultMessage} ({reason})")
    {
    }

    /// <summary>
    /// Initializes the exception, describing how the authority was unreachable, and the transport
    /// failure that caused it.
    /// </summary>
    /// <param name="reason">
    /// What went wrong at the transport level, e.g. "the request timed out". Never contains a
    /// credential.
    /// </param>
    /// <param name="innerException">The underlying transport failure.</param>
    public IdentityProviderUnreachableException(string reason, Exception innerException)
        : base($"{DefaultMessage} ({reason})", innerException)
    {
    }
}

/// <summary>
/// The identity authority accepted the credentials but did not return an identity this store can
/// act on — a required attribute was missing, or the authority named a role outside the four the
/// store recognizes.
/// </summary>
/// <remarks>
/// Separate from both of its siblings on purpose. The credentials were good, so it is not an
/// invalid credential; the authority answered, so it is not unreachable. It means the authority's
/// own employee record is incomplete or misconfigured, which is a different problem with a
/// different fix, and reporting it as either sibling would send whoever debugs it to the wrong
/// place. Like unreachability it is a hard block: no partial or defaulted identity is invented to
/// paper over it.
/// </remarks>
public sealed class EmployeeIdentityIncompleteException : IdentityException
{
    /// <summary>
    /// Initializes the exception, naming what the authority failed to supply.
    /// </summary>
    /// <param name="detail">
    /// Which attribute was missing or unrecognized, e.g. "no department was supplied". Never
    /// contains a credential.
    /// </param>
    public EmployeeIdentityIncompleteException(string detail)
        : base($"The identity provider accepted the credentials but returned an identity this store cannot use ({detail}).")
    {
    }
}

/// <summary>
/// The credentials were accepted, but the employee's other sessions could not be ended, so signing
/// in cannot be completed.
/// </summary>
/// <remarks>
/// A hard block, for the same reason its siblings are: an employee is meant to be signed in from
/// one place at a time, and a sign-in that returned a session without having ended the others would
/// quietly break that promise while looking like an ordinary success. Failing loudly is the only
/// honest answer — the alternative leaves two live sessions and nobody aware of it. Distinct from
/// <see cref="IdentityProviderUnreachableException"/> on purpose: the authority was reachable
/// enough to verify a PIN, so "unreachable" would send whoever debugs it to the wrong place, and
/// the employee's own credentials were never in question.
/// </remarks>
public sealed class SessionTerminationFailedException : IdentityException
{
    private const string DefaultMessage =
        "Sign-in was not completed because the employee's other sessions could not be ended.";

    /// <summary>
    /// Initializes the exception, describing why the other sessions could not be ended.
    /// </summary>
    /// <param name="reason">
    /// What went wrong, e.g. "the admin API returned 403". Never contains a credential, a PIN, or
    /// any token — including the service account's own.
    /// </param>
    public SessionTerminationFailedException(string reason)
        : base($"{DefaultMessage} ({reason})")
    {
    }

    /// <summary>
    /// Initializes the exception, describing why the other sessions could not be ended, and the
    /// failure that caused it.
    /// </summary>
    /// <param name="reason">
    /// What went wrong, e.g. "the connection failed". Never contains a credential, a PIN, or any
    /// token — including the service account's own.
    /// </param>
    /// <param name="innerException">The underlying failure.</param>
    public SessionTerminationFailedException(string reason, Exception innerException)
        : base($"{DefaultMessage} ({reason})", innerException)
    {
    }
}

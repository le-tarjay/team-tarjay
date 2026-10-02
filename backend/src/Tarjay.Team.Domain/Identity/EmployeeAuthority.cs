namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// The authority an employee holds, as the identity authority records it: their tier, the
/// department they belong to, and the job they do.
/// </summary>
/// <remarks>
/// Read the same way wherever it is needed. Sign-in reads it to build the session's
/// <see cref="EmployeeIdentity"/>, and manager approval reads it to decide whether an approver is
/// eligible. Two paths reading this differently would let a manager pass one check and fail the
/// other on the same record.
/// </remarks>
public sealed class EmployeeAuthority
{
    /// <summary>The authority tier this employee holds.</summary>
    public required EmployeeRole Role { get; init; }

    /// <summary>
    /// The department this employee belongs to, e.g. "Grocery". Empty when the identity authority
    /// supplied none. Whether an empty department is acceptable is the caller's decision.
    /// </summary>
    public required string Department { get; init; }

    /// <summary>
    /// The job this employee does, e.g. "Customer Support". Empty when the identity authority
    /// supplied none. Whether an empty job function is acceptable is the caller's decision.
    /// </summary>
    public required string JobFunction { get; init; }
}

namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// Who a signed-in employee is and what authority they hold, as resolved once by the identity
/// authority at sign-in.
/// </summary>
/// <remarks>
/// This is resolved a single time, at sign-in, and then held for the life of the session — it is
/// never re-checked live against the authority on subsequent actions. An authority-side change to
/// an employee's role or department therefore takes effect at that employee's next sign-in, not
/// mid-shift. There is no local credential cache and no offline fallback: if the authority cannot
/// be reached, no identity is produced at all.
/// </remarks>
public sealed class EmployeeIdentity
{
    /// <summary>The employee's own identifier — the Employee ID they sign in with.</summary>
    public required string EmployeeId { get; init; }

    /// <summary>The employee's display name, as the header shows it.</summary>
    public required string Name { get; init; }

    /// <summary>The authority tier this employee holds.</summary>
    public required EmployeeRole Role { get; init; }

    /// <summary>
    /// The department this employee belongs to, e.g. "Grocery". Storewide roles still carry a
    /// department, because department scope and authority tier are independent axes.
    /// </summary>
    public required string Department { get; init; }

    /// <summary>
    /// The job this employee actually does, e.g. "Customer Support" or "Receiving". Distinct from
    /// <see cref="Role"/>: the tier says what authority they hold, the job function says what work
    /// they are here to do.
    /// </summary>
    public required string JobFunction { get; init; }
}

using System;
using System.Text.Json.Serialization;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The manager who approved: who they are, the tier they approved under, and their department.
/// </summary>
public sealed class ManagerApprovalCheckResponse
{
    /// <summary>The approving manager's display name.</summary>
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    /// <summary>
    /// The approving manager's authority tier, as a role name: <c>DepartmentManager</c> or
    /// <c>StoreManager</c>. Named <c>role</c> to match the sign-in response.
    /// </summary>
    [JsonPropertyName("role")]
    public required string Role { get; init; }

    /// <summary>The approving manager's own department.</summary>
    [JsonPropertyName("department")]
    public required string Department { get; init; }

    /// <summary>Maps the approving manager onto the wire shape.</summary>
    /// <param name="approver">The manager the check accepted.</param>
    /// <returns>The response body's <c>data</c> payload.</returns>
    public static ManagerApprovalCheckResponse From(EmployeeIdentity approver)
    {
        ArgumentNullException.ThrowIfNull(approver);

        return new ManagerApprovalCheckResponse
        {
            Name = approver.Name,
            Role = approver.Role.ToString(),
            Department = approver.Department,
        };
    }
}

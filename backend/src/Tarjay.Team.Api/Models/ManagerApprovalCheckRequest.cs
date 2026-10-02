using System.Text.Json.Serialization;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The approving manager's credentials, submitted from the requesting device.
/// </summary>
/// <remarks>
/// No department is sent. The request is scoped to the requester's own department, read from their
/// token. Both properties are nullable so a missing one is reported by validation, field by field.
/// </remarks>
public sealed class ManagerApprovalCheckRequest
{
    /// <summary>The approving manager's Employee ID.</summary>
    [JsonPropertyName("employeeId")]
    public string? EmployeeId { get; init; }

    /// <summary>
    /// The approving manager's PIN. Never logged and never echoed back in any response, at any level.
    /// </summary>
    [JsonPropertyName("pin")]
    public string? Pin { get; init; }
}

using System.Text.Json.Serialization;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The credentials an employee submits to sign in.
/// </summary>
/// <remarks>
/// Both properties are nullable so that a missing one is caught by validation and reported as a
/// field-level failure, rather than being rejected by model binding with a less specific message.
/// </remarks>
public sealed class SignInRequest
{
    /// <summary>The employee's Employee ID.</summary>
    [JsonPropertyName("employeeId")]
    public string? EmployeeId { get; init; }

    /// <summary>
    /// The employee's PIN. Never logged and never echoed back in any response, at any level.
    /// </summary>
    [JsonPropertyName("pin")]
    public string? Pin { get; init; }
}

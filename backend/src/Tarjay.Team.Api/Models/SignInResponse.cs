using System;
using System.Text.Json.Serialization;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The identity a successful sign-in resolved to: who the employee is and what authority they
/// hold, for the whole of the session that follows.
/// </summary>
public sealed class SignInResponse
{
    /// <summary>The employee's Employee ID.</summary>
    [JsonPropertyName("employeeId")]
    public required string EmployeeId { get; init; }

    /// <summary>The employee's display name.</summary>
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    /// <summary>
    /// The employee's authority tier, as the name of one of the four roles the store recognizes —
    /// <c>Associate</c>, <c>DepartmentManager</c>, <c>StoreManager</c>, or
    /// <c>ReceivingAssociate</c>.
    /// </summary>
    /// <remarks>
    /// Sent as a name rather than a number on purpose: a consumer reading this contract should
    /// never have to know the ordinal of an enum member, and adding a role later must not
    /// renumber the existing ones.
    /// </remarks>
    [JsonPropertyName("role")]
    public required string Role { get; init; }

    /// <summary>The employee's department.</summary>
    [JsonPropertyName("department")]
    public required string Department { get; init; }

    /// <summary>The employee's job function.</summary>
    [JsonPropertyName("jobFunction")]
    public required string JobFunction { get; init; }

    /// <summary>Maps a resolved domain identity onto the wire shape.</summary>
    /// <param name="identity">The identity the authority resolved.</param>
    /// <returns>The response body's <c>data</c> payload.</returns>
    public static SignInResponse From(EmployeeIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(identity);

        return new SignInResponse
        {
            EmployeeId = identity.EmployeeId,
            Name = identity.Name,
            Role = identity.Role.ToString(),
            Department = identity.Department,
            JobFunction = identity.JobFunction,
        };
    }
}

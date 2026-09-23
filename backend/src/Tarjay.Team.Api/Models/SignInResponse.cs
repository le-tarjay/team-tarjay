using System;
using System.Text.Json.Serialization;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The session a successful sign-in resolved to: who the employee is, what authority they hold for
/// the whole of the session that follows, and the tokens that session runs on.
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

    /// <summary>
    /// The access token this session runs on, exactly as the identity authority issued it.
    /// </summary>
    /// <remarks>
    /// Named the way the authority names it, rather than in this envelope's camelCase, because it
    /// is the authority's artifact passed through untouched and not a field this API invented. A
    /// consumer reading <c>access_token</c> here and <c>access_token</c> from a refresh against
    /// Keycloak itself is reading the same thing under the same name.
    /// </remarks>
    [JsonPropertyName("access_token")]
    public required string AccessToken { get; init; }

    /// <summary>
    /// The refresh token this session runs on, exactly as the identity authority issued it. Named
    /// as the authority names it, for the same reason as <see cref="AccessToken"/>.
    /// </summary>
    [JsonPropertyName("refresh_token")]
    public required string RefreshToken { get; init; }

    /// <summary>Maps a resolved domain session onto the wire shape.</summary>
    /// <param name="session">The session the authority resolved.</param>
    /// <returns>The response body's <c>data</c> payload.</returns>
    public static SignInResponse From(EmployeeSession session)
    {
        ArgumentNullException.ThrowIfNull(session);

        return new SignInResponse
        {
            EmployeeId = session.Identity.EmployeeId,
            Name = session.Identity.Name,
            Role = session.Identity.Role.ToString(),
            Department = session.Identity.Department,
            JobFunction = session.Identity.JobFunction,

            // Passed through, never re-wrapped or re-signed: the store issues no session artifact
            // of its own, so there is nothing here that could disagree with what Keycloak holds.
            AccessToken = session.AccessToken,
            RefreshToken = session.RefreshToken,
        };
    }
}

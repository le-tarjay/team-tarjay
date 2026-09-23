using System.Text.Json.Serialization;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The calling employee's current shift status, and whether that status puts them on duty.
/// </summary>
public sealed class ShiftStatusResponse
{
    /// <summary>
    /// The shift status, as the name of one of the three states — <c>OffShift</c>,
    /// <c>OnShift</c>, or <c>OnBreak</c>.
    /// </summary>
    /// <remarks>
    /// Sent as a name rather than a number for the same reason the sign-in response sends the
    /// role as one: a consumer should never need to know an enum member's ordinal.
    /// </remarks>
    [JsonPropertyName("status")]
    public required string Status { get; init; }

    /// <summary>Whether the employee is on duty: clocked in and not on break.</summary>
    /// <remarks>
    /// Carried alongside <see cref="Status"/> rather than left for each consumer to work out, so
    /// the one definition of on duty stays on the server.
    /// </remarks>
    [JsonPropertyName("onDuty")]
    public required bool OnDuty { get; init; }

    /// <summary>Maps a domain shift status onto the wire shape.</summary>
    /// <param name="status">The employee's current shift status.</param>
    /// <returns>The response body's <c>data</c> payload.</returns>
    public static ShiftStatusResponse From(ShiftStatus status) =>
        new()
        {
            Status = status.ToString(),
            OnDuty = status.IsOnDuty(),
        };
}

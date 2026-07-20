using System.Text.Json.Serialization;

namespace Tarjay.Team.Contact;

/// <summary>
/// The neutral demo entity being imported. A contact record with a stable external id and
/// basic profile fields — deliberately generic so the sample carries no domain logic.
/// </summary>
public class Contact
{
    /// <summary>Assigned by the store when the contact is first created. 0 before persistence.</summary>
    [JsonPropertyName("contactId")] public int ContactId { get; set; }

    /// <summary>Caller-supplied stable identifier; the idempotency key for upserts.</summary>
    [JsonPropertyName("externalId")] public string ExternalId { get; set; } = null!;

    [JsonPropertyName("firstName")] public string FirstName { get; set; } = null!;

    [JsonPropertyName("lastName")] public string LastName { get; set; } = null!;

    [JsonPropertyName("email")] public string Email { get; set; } = null!;

    [JsonPropertyName("phone")] public string? Phone { get; set; }

    [JsonPropertyName("companyName")] public string? CompanyName { get; set; }
}

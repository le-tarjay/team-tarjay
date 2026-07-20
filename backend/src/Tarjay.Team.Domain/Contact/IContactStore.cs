namespace Tarjay.Team.Contact;

/// <summary>
/// The persistence "sink" for contacts. In this sample it is an in-memory store; in a real
/// system it would be a database or an external API. Kept behind an interface so activities
/// depend on the behaviour (idempotent upsert, lookup) rather than the implementation.
/// </summary>
public interface IContactStore
{
  /// <summary>
  /// Inserts a new contact or updates the existing one with the same
  /// <see cref="Contact.ExternalId"/>. This upsert-by-key behaviour is what makes the
  /// persistence activity idempotent under Temporal retries.
  /// </summary>
  /// <returns>The stored contact (with an assigned id) and whether it was newly created.</returns>
  (Contact Contact, bool WasCreated) Upsert(Contact contact);

  /// <summary>Finds a contact by external id, or returns null.</summary>
  Contact? FindByExternalId(string externalId);

  /// <summary>Finds a contact by email (case-insensitive), or returns null.</summary>
  Contact? FindByEmail(string email);
}
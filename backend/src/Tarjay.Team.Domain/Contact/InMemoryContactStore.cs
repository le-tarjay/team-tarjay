using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace Tarjay.Team.Contact;

/// <summary>
/// Thread-safe in-memory <see cref="IContactStore"/>. Registered as a singleton so it survives
/// for the life of the worker process and is shared by both import flows.
/// <para>
/// It is intentionally simple: state is lost on restart. That is fine for a demonstration and
/// keeps the focus on Temporal orchestration rather than data infrastructure.
/// </para>
/// </summary>
public sealed class InMemoryContactStore : IContactStore
{
    private readonly ConcurrentDictionary<string, Contact> _byExternalId =
      new(StringComparer.OrdinalIgnoreCase);

    private int _nextId;

    public (Contact Contact, bool WasCreated) Upsert(Contact contact)
    {
        ArgumentNullException.ThrowIfNull(contact);

        var wasCreated = false;

        var stored = _byExternalId.AddOrUpdate(
          contact.ExternalId,
          _ =>
          {
              wasCreated = true;
              contact.ContactId = System.Threading.Interlocked.Increment(ref _nextId);
              return contact;
          },
          (_, existing) =>
          {
              // Preserve the id assigned on first insert; update the mutable fields.
              contact.ContactId = existing.ContactId;
              return contact;
          });

        return (stored, wasCreated);
    }

    public Contact? FindByExternalId(string externalId)
      => _byExternalId.GetValueOrDefault(externalId);

    public Contact? FindByEmail(string email)
      => _byExternalId.Values.FirstOrDefault(c =>
        string.Equals(c.Email, email, StringComparison.OrdinalIgnoreCase));
}

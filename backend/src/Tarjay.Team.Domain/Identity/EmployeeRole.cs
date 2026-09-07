namespace Tarjay.Team.Domain.Identity;

/// <summary>
/// The authority tier an employee holds. This is the closed set of four tiers the store
/// recognizes; it is deliberately not the same axis as department or job function, both of
/// which vary independently of the tier (a Department Manager and a Receiving Associate can
/// sit in the same department doing different jobs).
/// </summary>
public enum EmployeeRole
{
    /// <summary>Any department-bound associate, including a Cashier.</summary>
    Associate,

    /// <summary>Manages a single department.</summary>
    DepartmentManager,

    /// <summary>Manages the store, storewide.</summary>
    StoreManager,

    /// <summary>Handles receiving, storewide rather than department-bound.</summary>
    ReceivingAssociate,
}

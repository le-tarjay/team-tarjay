using System;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers store-owned attendance: clock-in records and the shift status derived from them.
/// </summary>
internal static class AttendanceServiceCollectionExtensions
{
    /// <summary>
    /// Registers the in-memory attendance store behind <see cref="IAttendanceStore"/>, as a
    /// singleton.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <returns>The same service collection, for chaining.</returns>
    /// <remarks>
    /// A singleton because attendance is one shared fact for the whole store — a second instance
    /// would be a second, silently divergent copy of who is on the clock. Registered through a
    /// factory so the container builds the empty store rather than choosing between its
    /// constructors on its own.
    /// </remarks>
    public static IServiceCollection AddAttendance(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<IAttendanceStore>(static _ => new InMemoryAttendanceStore());

        return services;
    }
}

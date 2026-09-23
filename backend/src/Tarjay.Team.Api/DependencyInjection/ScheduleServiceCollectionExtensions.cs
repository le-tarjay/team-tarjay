using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers the read-only employee schedule: who is scheduled to work when.
/// </summary>
internal static class ScheduleServiceCollectionExtensions
{
    /// <summary>
    /// Registers the seeded in-memory schedule behind <see cref="IScheduleStore"/>, as a
    /// singleton, and the system clock it reads today from.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <returns>The same service collection, for chaining.</returns>
    /// <remarks>
    /// The clock is registered with <c>TryAdd</c>, so a test, or a later registration that already
    /// provides a <see cref="TimeProvider"/>, keeps its own. Nothing about attendance is registered
    /// or read here. The two modules stay unwired from each other.
    /// </remarks>
    public static IServiceCollection AddSchedule(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<IScheduleStore>(static provider =>
            new InMemoryScheduleStore(provider.GetRequiredService<TimeProvider>()));

        return services;
    }
}

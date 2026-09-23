using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Api.IntegrationTests.Schedule;

/// <summary>
/// The real app, with its seeded schedule read against a clock stopped at <c>now</c>. It can
/// also start the attendance store from records a test chose.
/// </summary>
/// <remarks>
/// <para>
/// Only the schedule store's clock is stopped, not the app's. It is the same seeded store the app
/// registers, built with a fixed <see cref="TimeProvider"/>, so a test knows which dates the
/// window holds. Replacing the container's <see cref="TimeProvider"/> instead would also reach
/// the authentication handler, which would start judging token lifetimes against the stopped
/// clock.
/// </para>
/// <para>
/// The attendance records exist for the isolation tests. They let an employee be on the clock
/// while their schedule is read, and prove that it changes nothing.
/// </para>
/// </remarks>
public sealed class FixedClockScheduleFactory(DateTimeOffset now, params AttendanceRecord[] attendance) : ApiWebApplicationFactory
{
    private readonly TimeProvider _clock = new FixedTimeProvider(now);
    private readonly IReadOnlyList<AttendanceRecord> _attendance = attendance;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IScheduleStore>(new InMemoryScheduleStore(_clock)));
            services.Replace(ServiceDescriptor.Singleton<IAttendanceStore>(new InMemoryAttendanceStore(_attendance)));
        });
    }

    private sealed class FixedTimeProvider(DateTimeOffset instant) : TimeProvider
    {
        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;

        public override DateTimeOffset GetUtcNow() => instant.ToUniversalTime();
    }
}

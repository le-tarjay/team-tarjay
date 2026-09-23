using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Api.IntegrationTests.Attendance;

/// <summary>
/// The real app, with its attendance store starting from records a test chose.
/// </summary>
/// <remarks>
/// Nothing in the API can create an attendance record yet — clock-in and the break transitions
/// arrive in a later story — so the store is seeded through its constructor instead. It is the same
/// in-memory store the app registers, just not empty; everything between the request and the store
/// is the app's own.
/// </remarks>
public sealed class SeededAttendanceFactory(params AttendanceRecord[] records) : ApiWebApplicationFactory
{
    private readonly IReadOnlyList<AttendanceRecord> _records = records;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        base.ConfigureWebHost(builder);

        builder.ConfigureTestServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IAttendanceStore>(new InMemoryAttendanceStore(_records))));
    }
}

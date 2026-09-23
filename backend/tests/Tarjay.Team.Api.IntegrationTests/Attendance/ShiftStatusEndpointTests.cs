using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Domain.Attendance;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Attendance;

/// <summary>
/// <c>GET /v1/employees/me/shift</c>: the calling employee's shift status, read through the real
/// JWT bearer registration and the real attendance store.
/// </summary>
public class ShiftStatusEndpointTests
{
    private const string ShiftUrl = "/v1/employees/me/shift";
    private const string Employee = "10042";
    private const string AnotherEmployee = "10043";

    private static readonly DateTimeOffset s_morning = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetShift_WithNoAttendanceRecord_ReportsOffShift()
    {
        // Arrange — the app exactly as Program.cs composes it, attendance store and all. A freshly
        // signed-in employee has never clocked in.
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Employee));

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement data = await DataOf(response);
        Assert.Equal("OffShift", data.GetProperty("status").GetString());
        Assert.False(data.GetProperty("onDuty").GetBoolean());
    }

    [Fact]
    public async Task GetShift_WithAnActiveRecordAndNoOpenBreak_ReportsOnShift()
    {
        // Arrange — clocked in, one break already taken and over.
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(
                Employee,
                s_morning,
                breaks: [new BreakInterval(s_morning.AddHours(2), s_morning.AddHours(2.25))]));
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Employee));

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement data = await DataOf(response);
        Assert.Equal("OnShift", data.GetProperty("status").GetString());
        Assert.True(data.GetProperty("onDuty").GetBoolean());
    }

    [Fact]
    public async Task GetShift_WithAnActiveRecordAndAnOpenBreak_ReportsOnBreak()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(3))]));
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Employee));

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert — on break is still clocked in, but it is not on duty.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement data = await DataOf(response);
        Assert.Equal("OnBreak", data.GetProperty("status").GetString());
        Assert.False(data.GetProperty("onDuty").GetBoolean());
    }

    [Fact]
    public async Task GetShift_AfterClockingInAndOutEarlierTheSameDay_StillReportsOffShift()
    {
        // Arrange — two completed cycles this morning and nothing running now.
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, clockedOutAt: s_morning.AddHours(2)),
            new AttendanceRecord(Employee, s_morning.AddHours(3), clockedOutAt: s_morning.AddHours(5)));
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Employee));

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert — off shift, not on shift: having clocked in today is not being clocked in now.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement data = await DataOf(response);
        Assert.Equal("OffShift", data.GetProperty("status").GetString());
        Assert.False(data.GetProperty("onDuty").GetBoolean());
    }

    [Fact]
    public async Task GetShift_WithNoBearerToken_Responds401WithNoShiftData()
    {
        // Arrange — a record exists, so a leak would have something to leak.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = factory.CreateClient();

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert — refused at the pipeline, before the action or the store is reached.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Null(factory.Principal.Principal);
    }

    [Fact]
    public async Task GetShift_WithAnExpiredToken_Responds401WithNoShiftData()
    {
        // Arrange — a token for the default employee, who is on shift, that has run out.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(TestRealm.DefaultEmployeeId, s_morning));
        using var client = Authenticated(factory, TestRealm.ExpiredToken());

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetShift_WithATokenSignedByAnUnpublishedKey_Responds401WithNoShiftData()
    {
        // Arrange — the shape of a forged token, naming an employee who is on shift.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(TestRealm.DefaultEmployeeId, s_morning));
        using var client = Authenticated(factory, TestRealm.TokenSignedByAnotherKey());

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetShift_WithAValidTokenNamingNoEmployee_Responds401WithNoShiftData()
    {
        // Arrange — the realm's signature, but an empty `preferred_username`: a caller who cannot
        // be attributed to anyone, so there is no shift of theirs to report.
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: string.Empty));

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert — the bearer scheme's own challenge, indistinguishable from any other refusal.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task GetShift_ReadsTheCallingEmployeeFromPreferredUsername()
    {
        // Arrange — one employee on shift, another with no record. The records are keyed on the
        // Employee ID, which is `preferred_username`; the token's `sub` is a different value, so
        // an endpoint that looked the caller up by `sub` would find nothing and answer off shift.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var onShift = Authenticated(factory, TestRealm.ValidToken(employeeId: Employee));
        using var offShift = Authenticated(factory, TestRealm.ValidToken(employeeId: AnotherEmployee));

        // Act
        using var onShiftResponse = await onShift.GetAsync(ShiftUrl);
        using var offShiftResponse = await offShift.GetAsync(ShiftUrl);

        // Assert — each caller gets their own status, and only their own.
        Assert.Equal("OnShift", (await DataOf(onShiftResponse)).GetProperty("status").GetString());
        Assert.Equal("OffShift", (await DataOf(offShiftResponse)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetShift_IgnoresAnEmployeeIdInTheQueryString()
    {
        // Arrange — the caller has no record; the employee they name in the query does.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: AnotherEmployee));

        // Act
        using var response = await client.GetAsync($"{ShiftUrl}?employeeId={Employee}");

        // Assert — the token decides who is asking, and a query string cannot override it.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("OffShift", (await DataOf(response)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetShift_IgnoresAnEmployeeIdInTheBody()
    {
        // Arrange — the same, with the other employee named in a request body.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: AnotherEmployee));
        using var request = new HttpRequestMessage(HttpMethod.Get, ShiftUrl)
        {
            Content = JsonContent.Create(new { employeeId = Employee }),
        };

        // Act
        using var response = await client.SendAsync(request);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("OffShift", (await DataOf(response)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetShift_HasNoRouteThatNamesAnotherEmployee()
    {
        // Arrange — an employee on shift, and a caller trying to read them by putting their ID
        // where `me` goes.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: AnotherEmployee));

        // Act
        using var response = await client.GetAsync($"/v1/employees/{Employee}/shift");

        // Assert — there is no such route; `me` is the only employee this endpoint answers about.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetShift_WrapsTheStatusInTheSuccessEnvelope()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Employee));

        // Act
        using var response = await client.GetAsync(ShiftUrl);

        // Assert — `data` carries the status and `meta` is present and empty, the same shape as
        // every other success response.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Object, body.RootElement.GetProperty("data").ValueKind);
        Assert.Equal(JsonValueKind.Object, body.RootElement.GetProperty("meta").ValueKind);
        Assert.Empty(body.RootElement.GetProperty("meta").EnumerateObject());
    }

    [Fact]
    public void AttendanceStore_IsOneInstanceForTheWholeApp()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();

        // Act
        IAttendanceStore first = factory.Services.GetRequiredService<IAttendanceStore>();
        IAttendanceStore second = factory.Services.GetRequiredService<IAttendanceStore>();

        // Assert — a second instance would be a second, silently divergent copy of who is on the
        // clock. Every register on the store's backend reads the same one.
        Assert.Same(first, second);
    }

    private static HttpClient Authenticated(WebApplicationFactory<Program> factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    private static async Task<JsonElement> DataOf(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        return body.RootElement.GetProperty("data").Clone();
    }
}

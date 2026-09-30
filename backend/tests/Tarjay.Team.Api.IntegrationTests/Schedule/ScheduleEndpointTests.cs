using System;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Api.Controllers;
using Tarjay.Team.Domain.Attendance;
using Tarjay.Team.Domain.Schedule;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Schedule;

/// <summary>
/// <c>GET /v1/employees/me/shifts</c>: the calling employee's own schedule, read through the real
/// JWT bearer registration and the real seeded schedule store.
/// </summary>
/// <remarks>
/// The clock is stopped at 10:00 UTC on Wednesday 23 September 2026, so the window runs from
/// Thursday 17 September to Tuesday 6 October. The seed (<see cref="ScheduleSeed"/>) has employee
/// 10041 off on Wednesdays and working 12:00–20:00 on Thursdays, and employee 10042 working
/// 07:00–15:30 on Wednesdays.
/// </remarks>
public class ScheduleEndpointTests
{
    private const string ShiftsUrl = "/v1/employees/me/shifts";
    private const string ShiftUrl = "/v1/employees/me/shift";
    private const string Associate = "10041";
    private const string DepartmentManager = "10042";
    private const string StoreManager = "10043";

    private static readonly DateTimeOffset s_wednesdayMorning = new(2026, 9, 23, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetShifts_ForASeededEmployee_ListsEveryDayOfTheWindowInDateOrder()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — one entry per day, oldest first, from six days back to thirteen ahead.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement[] shifts = await ShiftsOf(response);
        string[] dates = [.. shifts.Select(shift => shift.GetProperty("date").GetString()!)];

        Assert.Equal(ScheduleWindow.Length, shifts.Length);
        Assert.Equal("2026-09-17", dates[0]);
        Assert.Equal("2026-10-06", dates[^1]);
        Assert.Equal(dates.Order(StringComparer.Ordinal), dates);
        Assert.Equal(dates.Length, dates.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task GetShifts_ForAWorkedShift_CarriesDayDateDepartmentAndTimeRange()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — Thursday is a 12:00–20:00 shift in Grocery.
        JsonElement thursday = On(await ShiftsOf(response), "2026-09-24");

        Assert.Equal("Thursday", thursday.GetProperty("day").GetString());
        Assert.Equal("Grocery", thursday.GetProperty("department").GetString());
        Assert.False(thursday.GetProperty("dayOff").GetBoolean());
        Assert.Equal("12:00", thursday.GetProperty("start").GetString());
        Assert.Equal("20:00", thursday.GetProperty("end").GetString());
    }

    [Fact]
    public async Task GetShifts_OnAScheduledDayOff_MarksItAsADayOffWithNoTimeRange()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — Wednesday is the associate's day off. It is flagged, and the time range keys
        // are there but null, so the entry has the same shape as a shift and carries no hours.
        JsonElement wednesday = On(await ShiftsOf(response), "2026-09-23");

        Assert.Equal("Wednesday", wednesday.GetProperty("day").GetString());
        Assert.Equal("Grocery", wednesday.GetProperty("department").GetString());
        Assert.True(wednesday.GetProperty("dayOff").GetBoolean());
        Assert.Equal(JsonValueKind.Null, wednesday.GetProperty("start").ValueKind);
        Assert.Equal(JsonValueKind.Null, wednesday.GetProperty("end").ValueKind);
    }

    [Fact]
    public async Task GetShifts_ForTwoEmployees_EachSeesOnlyTheirOwnSeededShifts()
    {
        // Arrange — two Grocery employees in one app, with different weeks.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var associate = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));
        using var manager = Authenticated(factory, TestRealm.ValidToken(employeeId: DepartmentManager));

        // Act
        using var associateResponse = await associate.GetAsync(ShiftsUrl);
        using var managerResponse = await manager.GetAsync(ShiftsUrl);

        // Assert — the same Wednesday is the associate's day off and the manager's early shift.
        JsonElement[] associateShifts = await ShiftsOf(associateResponse);
        JsonElement[] managerShifts = await ShiftsOf(managerResponse);

        Assert.True(On(associateShifts, "2026-09-23").GetProperty("dayOff").GetBoolean());
        Assert.Equal("07:00", On(managerShifts, "2026-09-23").GetProperty("start").GetString());
        Assert.Equal("15:30", On(managerShifts, "2026-09-23").GetProperty("end").GetString());

        // And each whole list is exactly that employee's own seeded rota, day by day.
        Assert.Equal(Expected(Associate), associateShifts.Select(Summary));
        Assert.Equal(Expected(DepartmentManager), managerShifts.Select(Summary));
    }

    [Fact]
    public async Task GetShifts_ReadsTheCallingEmployeeFromPreferredUsername()
    {
        // Arrange — the schedule is keyed on the Employee ID, which is `preferred_username`. The
        // token's `sub` is a different, GUID-shaped value that keys nothing, so an endpoint that
        // looked the caller up by `sub` would find no schedule and answer with an empty list.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: StoreManager));

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert
        JsonElement[] shifts = await ShiftsOf(response);

        Assert.NotEmpty(shifts);
        Assert.All(shifts, shift => Assert.Equal("Store Operations", shift.GetProperty("department").GetString()));
    }

    [Fact]
    public async Task GetShifts_IgnoresAnEmployeeIdInTheQueryString()
    {
        // Arrange — the associate names the store manager in the query.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));

        // Act
        using var response = await client.GetAsync($"{ShiftsUrl}?employeeId={StoreManager}");

        // Assert — the token decides whose schedule this is, and a query string can't override it.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Expected(Associate), (await ShiftsOf(response)).Select(Summary));
    }

    [Fact]
    public async Task GetShifts_HasNoRouteThatNamesAnotherEmployee()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));

        // Act — the store manager's ID where `me` goes.
        using var response = await client.GetAsync($"/v1/employees/{StoreManager}/shifts");

        // Assert — there is no such route. `me` is the only employee this endpoint answers about.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetShifts_ForAnEmployeeWithNoSchedule_RespondsWithAnEmptyList()
    {
        // Arrange — the test realm's default employee is not one of the seeded five.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken());

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — nothing scheduled is an answer, not an error.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(await ShiftsOf(response));
    }

    [Fact]
    public async Task GetShifts_WithNoBearerToken_Responds401WithNoScheduleData()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = factory.CreateClient();

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — refused at the pipeline, before the action or the store is reached.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Null(factory.Principal.Principal);
    }

    [Fact]
    public void GetShifts_IsMappedBehindAuthorization()
    {
        // Arrange — the app's own routing table. The 401 tests above cannot tell `[Authorize]` apart
        // from the action's fallback challenge for a nameless token, since both answer 401. So this
        // reads the attribute where the pipeline reads it.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        EndpointDataSource endpoints = factory.Services.GetRequiredService<EndpointDataSource>();

        // Act
        RouteEndpoint shifts = endpoints.Endpoints
            .OfType<RouteEndpoint>()
            .Single(endpoint => endpoint.RoutePattern.RawText == "v1/employees/me/shifts");

        // Assert — protected, and nothing on it opts back out.
        Assert.NotEmpty(shifts.Metadata.GetOrderedMetadata<IAuthorizeData>());
        Assert.Null(shifts.Metadata.GetMetadata<IAllowAnonymous>());
    }

    [Fact]
    public async Task GetShifts_WithAnExpiredToken_Responds401WithNoScheduleData()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ExpiredToken());

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetShifts_WithATokenSignedByAnUnpublishedKey_Responds401WithNoScheduleData()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.TokenSignedByAnotherKey());

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetShifts_WithAValidTokenNamingNoEmployee_Responds401WithNoScheduleData()
    {
        // Arrange — the realm's signature, but an empty `preferred_username`.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: string.Empty));

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — the bearer scheme's own challenge, not an empty schedule that looks like one.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public async Task Shifts_AcceptsNoWrite(string method)
    {
        // Arrange — an authenticated caller, so a refusal can only mean the method is not mapped.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));
        using var request = new HttpRequestMessage(new HttpMethod(method), ShiftsUrl);

        // Act
        using var response = await client.SendAsync(request);

        // Assert — read-only: there is nothing here that authors or edits a schedule.
        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }

    [Fact]
    public async Task GetShifts_WrapsTheListInTheSuccessEnvelope()
    {
        // Arrange
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: Associate));

        // Act
        using var response = await client.GetAsync(ShiftsUrl);

        // Assert — `data` is the list and `meta` is present and empty. The list is fixed-length and
        // is not paginated.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, body.RootElement.GetProperty("data").ValueKind);
        Assert.Equal(JsonValueKind.Object, body.RootElement.GetProperty("meta").ValueKind);
        Assert.Empty(body.RootElement.GetProperty("meta").EnumerateObject());
    }

    [Fact]
    public async Task GetShifts_WhileTheEmployeeIsOnTheClock_ReturnsTheSameScheduleAsWhenTheyAreNot()
    {
        // Arrange — the same employee in two apps: clocked in and on break in one, never clocked in
        // in the other.
        var onBreak = new AttendanceRecord(
            Associate,
            s_wednesdayMorning.AddHours(-2),
            breaks: [new BreakInterval(s_wednesdayMorning.AddMinutes(-10))]);
        using var clockedIn = new FixedClockScheduleFactory(s_wednesdayMorning, onBreak);
        using var clockedOut = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var clockedInClient = Authenticated(clockedIn, TestRealm.ValidToken(employeeId: Associate));
        using var clockedOutClient = Authenticated(clockedOut, TestRealm.ValidToken(employeeId: Associate));

        // Act
        using var clockedInResponse = await clockedInClient.GetAsync(ShiftsUrl);
        using var clockedOutResponse = await clockedOutClient.GetAsync(ShiftsUrl);

        // Assert — attendance does not reach the schedule, byte for byte.
        Assert.Equal(
            await clockedOutResponse.Content.ReadAsStringAsync(),
            await clockedInResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetShift_ForAnEmployeeScheduledToWorkRightNow_StillReportsOffShift()
    {
        // Arrange — at 10:00 on Wednesday the department manager is inside their 07:00–15:30
        // scheduled shift, but has never clocked in.
        using var factory = new FixedClockScheduleFactory(s_wednesdayMorning);
        using var client = Authenticated(factory, TestRealm.ValidToken(employeeId: DepartmentManager));

        // Act
        using var scheduleResponse = await client.GetAsync(ShiftsUrl);
        using var statusResponse = await client.GetAsync(ShiftUrl);

        // Assert — being scheduled is informational only. It never makes anyone on shift.
        Assert.False(On(await ShiftsOf(scheduleResponse), "2026-09-23").GetProperty("dayOff").GetBoolean());

        using JsonDocument status = JsonDocument.Parse(await statusResponse.Content.ReadAsStringAsync());
        Assert.Equal("OffShift", status.RootElement.GetProperty("data").GetProperty("status").GetString());
        Assert.False(status.RootElement.GetProperty("data").GetProperty("onDuty").GetBoolean());
    }

    [Fact]
    public void ScheduleController_DependsOnNothingFromAttendance()
    {
        // Act
        Type[] dependencies = ConstructorDependencies(typeof(ScheduleController));

        // Assert
        Assert.Equal([typeof(IScheduleStore)], dependencies);
    }

    [Fact]
    public void AttendanceController_DependsOnNothingFromTheSchedule()
    {
        // Act
        Type[] dependencies = ConstructorDependencies(typeof(AttendanceController));

        // Assert
        Assert.DoesNotContain(dependencies, dependency => dependency.Namespace == typeof(IScheduleStore).Namespace);
    }

    [Fact]
    public void ScheduleStore_IsOneInstanceForTheWholeApp()
    {
        // Arrange — the app exactly as Program.cs composes it.
        using var factory = new ApiWebApplicationFactory();

        // Act
        IScheduleStore first = factory.Services.GetRequiredService<IScheduleStore>();
        IScheduleStore second = factory.Services.GetRequiredService<IScheduleStore>();

        // Assert
        Assert.IsType<InMemoryScheduleStore>(first);
        Assert.Same(first, second);
    }

    private static HttpClient Authenticated(WebApplicationFactory<Program> factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    private static async Task<JsonElement[]> ShiftsOf(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        return [.. body.RootElement.GetProperty("data").EnumerateArray().Select(shift => shift.Clone())];
    }

    private static JsonElement On(JsonElement[] shifts, string date) =>
        shifts.Single(shift => shift.GetProperty("date").GetString() == date);

    private static string Summary(JsonElement shift) =>
        string.Join(
            " ",
            shift.GetProperty("date").GetString(),
            shift.GetProperty("department").GetString(),
            shift.GetProperty("dayOff").GetBoolean() ? "off" : $"{shift.GetProperty("start").GetString()}-{shift.GetProperty("end").GetString()}");

    // What the employee's own seeded rota schedules across the window, in the same summary form
    // as the response.
    private static string[] Expected(string employeeId)
    {
        WeeklyRota rota = ScheduleSeed.Rotas[employeeId];
        DateOnly firstDay = ScheduleWindow.FirstDay(DateOnly.FromDateTime(s_wednesdayMorning.UtcDateTime));

        return
        [
            .. Enumerable.Range(0, ScheduleWindow.Length)
                .Select(offset => rota.ShiftOn(firstDay.AddDays(offset)))
                .Select(shift => string.Join(
                    " ",
                    shift.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    shift.Department,
                    shift.Hours is null ? "off" : FormattableString.Invariant($"{shift.Hours.Start:HH:mm}-{shift.Hours.End:HH:mm}"))),
        ];
    }

    private static Type[] ConstructorDependencies(Type controller) =>
        [.. controller.GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .SelectMany(constructor => constructor.GetParameters())
            .Select(parameter => parameter.ParameterType)];
}

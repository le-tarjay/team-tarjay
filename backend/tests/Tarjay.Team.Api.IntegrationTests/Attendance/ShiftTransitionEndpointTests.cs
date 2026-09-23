using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Testing;
using Tarjay.Team.Api.Controllers;
using Tarjay.Team.Domain.Attendance;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Attendance;

/// <summary>
/// <c>POST /v1/employees/me/{clock-in, clock-out, start-break, end-break}</c>: the calling
/// employee's shift transitions, through the real JWT bearer registration, the real exception
/// handler chain and the real attendance store.
/// </summary>
public class ShiftTransitionEndpointTests
{
    private const string ShiftUrl = "/v1/employees/me/shift";
    private const string ClockInUrl = "/v1/employees/me/clock-in";
    private const string ClockOutUrl = "/v1/employees/me/clock-out";
    private const string StartBreakUrl = "/v1/employees/me/start-break";
    private const string EndBreakUrl = "/v1/employees/me/end-break";

    private const string Employee = "10042";
    private const string AnotherEmployee = "10043";

    private static readonly DateTimeOffset s_morning = new(2026, 9, 23, 8, 0, 0, TimeSpan.Zero);

    public static TheoryData<string> TransitionUrls => [ClockInUrl, ClockOutUrl, StartBreakUrl, EndBreakUrl];

    // ---- Clock-in ------------------------------------------------------------------------------

    [Fact]
    public async Task ClockIn_FromOffShift_RespondsOnShiftAndTheStoreAgrees()
    {
        // Arrange — the app exactly as Program.cs composes it. Never clocked in.
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockInUrl, content: null);

        // Assert — the response reports the new status, and so does a separate read of it.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        JsonElement data = await DataOf(response);
        Assert.Equal("OnShift", data.GetProperty("status").GetString());
        Assert.True(data.GetProperty("onDuty").GetBoolean());
        Assert.Equal("OnShift", await StatusOf(client));
    }

    [Fact]
    public async Task ClockIn_WhileOnShift_Responds409AndLeavesStatusUnchanged()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockInUrl, content: null);

        // Assert — a real rejection, not a quiet success, and the shift is exactly as it was.
        await AssertRejected(response, currentStatus: "OnShift");
        Assert.Equal("OnShift", await StatusOf(client));
    }

    [Fact]
    public async Task ClockIn_WhileOnBreak_Responds409AndLeavesStatusUnchanged()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockInUrl, content: null);

        // Assert
        await AssertRejected(response, currentStatus: "OnBreak");
        Assert.Equal("OnBreak", await StatusOf(client));
    }

    [Fact]
    public async Task ClockIn_Twice_IsRejectedTheSecondTimeRatherThanTreatedAsIdempotent()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, Employee);

        // Act
        using var first = await client.PostAsync(ClockInUrl, content: null);
        using var second = await client.PostAsync(ClockInUrl, content: null);

        // Assert
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        await AssertRejected(second, currentStatus: "OnShift");
    }

    // ---- Clock-out -----------------------------------------------------------------------------

    [Fact]
    public async Task ClockOut_FromOnShift_RespondsOffShiftAndTheStoreAgrees()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockOutUrl, content: null);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        JsonElement data = await DataOf(response);
        Assert.Equal("OffShift", data.GetProperty("status").GetString());
        Assert.False(data.GetProperty("onDuty").GetBoolean());
        Assert.Equal("OffShift", await StatusOf(client));
    }

    [Fact]
    public async Task ClockOut_FromOnBreak_RespondsOffShift()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockOutUrl, content: null);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("OffShift", (await DataOf(response)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task ClockOut_FromOnShift_LeavesTheSignInSessionAlone()
    {
        // Arrange — on shift, with both of the app's routes to the employee's session recorded.
        using var factory = new SessionWatchingFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockOutUrl, content: null);

        // Assert — clocked out, and still signed in: the same bearer token is still accepted on the
        // very next request, and nothing asked Keycloak to resolve, end, or replace a session.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("OffShift", (await DataOf(response)).GetProperty("status").GetString());

        using var next = await client.GetAsync(ShiftUrl);
        Assert.Equal(HttpStatusCode.OK, next.StatusCode);

        Assert.Equal(0, factory.SessionAdministrator.Calls);
        Assert.Empty(factory.Resolver.Calls);
    }

    [Fact]
    public async Task ClockOut_WhileOffShift_Responds409()
    {
        // Arrange — clocked in and out already this morning.
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, clockedOutAt: s_morning.AddHours(4)));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockOutUrl, content: null);

        // Assert
        await AssertRejected(response, currentStatus: "OffShift");
        Assert.Equal("OffShift", await StatusOf(client));
    }

    [Fact]
    public async Task ClockOut_Twice_IsRejectedTheSecondTime()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, Employee);

        // Act
        using var first = await client.PostAsync(ClockOutUrl, content: null);
        using var second = await client.PostAsync(ClockOutUrl, content: null);

        // Assert
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        await AssertRejected(second, currentStatus: "OffShift");
    }

    // ---- Start break ---------------------------------------------------------------------------

    [Fact]
    public async Task StartBreak_FromOnShift_RespondsOnBreakAndTheStoreAgrees()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(StartBreakUrl, content: null);

        // Assert — on break is still clocked in, but it is not on duty.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        JsonElement data = await DataOf(response);
        Assert.Equal("OnBreak", data.GetProperty("status").GetString());
        Assert.False(data.GetProperty("onDuty").GetBoolean());
        Assert.Equal("OnBreak", await StatusOf(client));
    }

    [Fact]
    public async Task StartBreak_WhileOffShift_Responds409()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(StartBreakUrl, content: null);

        // Assert
        await AssertRejected(response, currentStatus: "OffShift");
        Assert.Equal("OffShift", await StatusOf(client));
    }

    [Fact]
    public async Task StartBreak_WhileAlreadyOnBreak_Responds409()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(StartBreakUrl, content: null);

        // Assert
        await AssertRejected(response, currentStatus: "OnBreak");
        Assert.Equal("OnBreak", await StatusOf(client));
    }

    // ---- End break -----------------------------------------------------------------------------

    [Fact]
    public async Task EndBreak_FromOnBreak_RespondsOnShiftDirectly()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(EndBreakUrl, content: null);

        // Assert — on shift, not off shift. And the shift that was running before the break is
        // still the one running: a clock-in is refused because the employee is on shift, which it
        // would not be if ending the break had passed them through off shift.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        JsonElement data = await DataOf(response);
        Assert.Equal("OnShift", data.GetProperty("status").GetString());
        Assert.True(data.GetProperty("onDuty").GetBoolean());
        Assert.Equal("OnShift", await StatusOf(client));

        using var clockIn = await client.PostAsync(ClockInUrl, content: null);
        await AssertRejected(clockIn, currentStatus: "OnShift");
    }

    [Fact]
    public async Task EndBreak_WhileOnShiftAndNotOnBreak_Responds409()
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(EndBreakUrl, content: null);

        // Assert
        await AssertRejected(response, currentStatus: "OnShift");
        Assert.Equal("OnShift", await StatusOf(client));
    }

    [Fact]
    public async Task EndBreak_WhileOffShift_Responds409()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(EndBreakUrl, content: null);

        // Assert
        await AssertRejected(response, currentStatus: "OffShift");
        Assert.Equal("OffShift", await StatusOf(client));
    }

    // ---- A whole shift -------------------------------------------------------------------------

    [Fact]
    public async Task Transitions_RunAFullShiftEndToEnd()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, Employee);

        // Act / Assert — each response reports the state the next request starts from.
        Assert.Equal("OnShift", await TransitionTo(client, ClockInUrl));
        Assert.Equal("OnBreak", await TransitionTo(client, StartBreakUrl));
        Assert.Equal("OnShift", await TransitionTo(client, EndBreakUrl));
        Assert.Equal("OffShift", await TransitionTo(client, ClockOutUrl));
        Assert.Equal("OnShift", await TransitionTo(client, ClockInUrl));
    }

    // ---- Held and parked sales -----------------------------------------------------------------

    [Fact]
    public void Transitions_HaveNoDependencyThroughWhichToReachASale()
    {
        // Arrange — the controller serving all four transitions, and the store behind it.
        Type[] controllerDependencies = typeof(AttendanceController)
            .GetConstructors()
            .SelectMany(constructor => constructor.GetParameters())
            .Select(parameter => parameter.ParameterType)
            .Distinct()
            .ToArray();

        Type[] storeDependencies = typeof(InMemoryAttendanceStore)
            .GetConstructors()
            .SelectMany(constructor => constructor.GetParameters())
            .Select(parameter => parameter.ParameterType)
            .Distinct()
            .ToArray();

        // Assert — nothing a start-break or clock-out runs can see a held or parked sale, because
        // the only things it is handed are the attendance store, the records it starts from, and
        // a clock. Whether an unparked cart auto-parks belongs to another project; this guards
        // against a transition quietly acquiring a way to touch one.
        Assert.Equal([typeof(IAttendanceStore)], controllerDependencies);
        Assert.All(
            storeDependencies,
            dependency => Assert.Contains(
                dependency,
                new[] { typeof(System.Collections.Generic.IEnumerable<AttendanceRecord>), typeof(TimeProvider) }));
        Assert.All(
            typeof(IAttendanceStore).GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .SelectMany(method => method.GetParameters()),
            parameter => Assert.Equal(typeof(string), parameter.ParameterType));
    }

    // ---- The rejection's shape -----------------------------------------------------------------

    [Fact]
    public async Task Rejection_IsAProblemDetailsOutsideTheEnvelope()
    {
        // Arrange
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(ClockOutUrl, content: null);

        // Assert — error responses stand alone at the top level, never wrapped in data/meta.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(body.RootElement.TryGetProperty("data", out _));
        Assert.False(body.RootElement.TryGetProperty("meta", out _));
        Assert.Equal(409, body.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The shift action was rejected.", body.RootElement.GetProperty("title").GetString());
        Assert.Equal(
            "Cannot clock out: the employee is off shift.",
            body.RootElement.GetProperty("detail").GetString());
        Assert.Equal(ClockOutUrl, body.RootElement.GetProperty("instance").GetString());
    }

    [Theory]
    [MemberData(nameof(TransitionUrls))]
    public async Task Transition_WrapsTheResultingStatusInTheSuccessEnvelope(string url)
    {
        // Arrange — a status from which this transition is allowed.
        using var factory = url switch
        {
            ClockInUrl => new SeededAttendanceFactory(),
            EndBreakUrl => new SeededAttendanceFactory(
                new AttendanceRecord(Employee, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))])),
            _ => new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning)),
        };
        using var client = Authenticated(factory, Employee);

        // Act
        using var response = await client.PostAsync(url, content: null);

        // Assert — the same shape the shift-status read returns, so a client handles both alike.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        JsonElement data = body.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.String, data.GetProperty("status").ValueKind);
        Assert.Contains(data.GetProperty("onDuty").ValueKind, new[] { JsonValueKind.True, JsonValueKind.False });
        Assert.Equal(JsonValueKind.Object, body.RootElement.GetProperty("meta").ValueKind);
        Assert.Empty(body.RootElement.GetProperty("meta").EnumerateObject());
    }

    // ---- Authentication ------------------------------------------------------------------------

    [Theory]
    [MemberData(nameof(TransitionUrls))]
    public async Task Transition_WithNoBearerToken_Responds401AndChangesNothing(string url)
    {
        // Arrange — the employee is on break, a status from which two of the four transitions
        // would be allowed, so a request that got through would have something to change.
        using var factory = new SeededAttendanceFactory(
            new AttendanceRecord(TestRealm.DefaultEmployeeId, s_morning, breaks: [new BreakInterval(s_morning.AddHours(1))]));
        using var anonymous = factory.CreateClient();

        // Act
        using var response = await anonymous.PostAsync(url, content: null);

        // Assert — refused at the pipeline, before the action or the store is reached.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Null(factory.Principal.Principal);

        using var owner = Authenticated(factory, TestRealm.DefaultEmployeeId);
        Assert.Equal("OnBreak", await StatusOf(owner));
    }

    [Theory]
    [MemberData(nameof(TransitionUrls))]
    public async Task Transition_WithAnExpiredToken_Responds401(string url)
    {
        // Arrange
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(TestRealm.DefaultEmployeeId, s_morning));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestRealm.ExpiredToken());

        // Act
        using var response = await client.PostAsync(url, content: null);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [MemberData(nameof(TransitionUrls))]
    public async Task Transition_WithAValidTokenNamingNoEmployee_Responds401(string url)
    {
        // Arrange — the realm's signature, but no Employee ID to apply the transition to.
        using var factory = new ApiWebApplicationFactory();
        using var client = Authenticated(factory, string.Empty);

        // Act
        using var response = await client.PostAsync(url, content: null);

        // Assert — the bearer scheme's own challenge, the same as any other refusal.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Contains("Bearer", response.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);
    }

    // ---- Who the transition applies to ---------------------------------------------------------

    [Fact]
    public async Task Transitions_ByTwoEmployees_DoNotAffectEachOthersRecords()
    {
        // Arrange — two employees on one store backend, each with their own token. `sub` differs
        // from `preferred_username` on both, so resolving by the wrong claim would find nobody.
        using var factory = new ApiWebApplicationFactory();
        using var first = Authenticated(factory, Employee);
        using var second = Authenticated(factory, AnotherEmployee);

        // Act / Assert — the first clocks in; the second is still off shift.
        Assert.Equal("OnShift", await TransitionTo(first, ClockInUrl));
        Assert.Equal("OffShift", await StatusOf(second));

        // The second clocks in on their own record, not refused as if the first's shift were theirs.
        Assert.Equal("OnShift", await TransitionTo(second, ClockInUrl));

        // The first goes on break; the second stays on shift.
        Assert.Equal("OnBreak", await TransitionTo(first, StartBreakUrl));
        Assert.Equal("OnShift", await StatusOf(second));

        // The second clocks out; the first is still on break.
        Assert.Equal("OffShift", await TransitionTo(second, ClockOutUrl));
        Assert.Equal("OnBreak", await StatusOf(first));

        // The second cannot end the first's break.
        using var endBreak = await second.PostAsync(EndBreakUrl, content: null);
        await AssertRejected(endBreak, currentStatus: "OffShift");
        Assert.Equal("OnBreak", await StatusOf(first));
    }

    [Fact]
    public async Task ClockIn_IgnoresAnEmployeeIdInTheQueryStringOrBody()
    {
        // Arrange — the caller names another employee in both places a caller might try.
        using var factory = new ApiWebApplicationFactory();
        using var caller = Authenticated(factory, AnotherEmployee);
        using var named = Authenticated(factory, Employee);

        // Act
        using var response = await caller.PostAsync(
            $"{ClockInUrl}?employeeId={Employee}",
            JsonContent.Create(new { employeeId = Employee }));

        // Assert — the token decides whose shift this is. The caller is clocked in; the employee
        // they named is not.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("OnShift", await StatusOf(caller));
        Assert.Equal("OffShift", await StatusOf(named));
    }

    [Theory]
    [InlineData("clock-in")]
    [InlineData("clock-out")]
    [InlineData("start-break")]
    [InlineData("end-break")]
    public async Task Transition_HasNoRouteThatNamesAnotherEmployee(string action)
    {
        // Arrange — an employee on shift, and a caller trying to act for them by putting their ID
        // where `me` goes.
        using var factory = new SeededAttendanceFactory(new AttendanceRecord(Employee, s_morning));
        using var client = Authenticated(factory, AnotherEmployee);

        // Act
        using var response = await client.PostAsync($"/v1/employees/{Employee}/{action}", content: null);

        // Assert — there is no such route, and the named employee's shift is untouched.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var owner = Authenticated(factory, Employee);
        Assert.Equal("OnShift", await StatusOf(owner));
    }

    // ---- Helpers -------------------------------------------------------------------------------

    private static HttpClient Authenticated(WebApplicationFactory<Program> factory, string employeeId)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", TestRealm.ValidToken(employeeId: employeeId));

        return client;
    }

    private static async Task<string?> TransitionTo(HttpClient client, string url)
    {
        using var response = await client.PostAsync(url, content: null);

        return (await DataOf(response)).GetProperty("status").GetString();
    }

    private static async Task<string?> StatusOf(HttpClient client)
    {
        using var response = await client.GetAsync(ShiftUrl);

        return (await DataOf(response)).GetProperty("status").GetString();
    }

    private static async Task<JsonElement> DataOf(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        return body.RootElement.GetProperty("data").Clone();
    }

    private static async Task AssertRejected(HttpResponseMessage response, string currentStatus)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(409, body.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(currentStatus, body.RootElement.GetProperty("shiftStatus").GetString());
    }
}

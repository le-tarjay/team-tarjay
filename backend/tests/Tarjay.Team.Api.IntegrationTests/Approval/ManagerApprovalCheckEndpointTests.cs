using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Tarjay.Team.Domain.Attendance;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Approval;

/// <summary>
/// <c>POST /v1/manager-approvals/check</c>: the approving manager's credentials checked with the
/// realm, then the eligibility rule against the requester's department, through the real DI graph.
/// </summary>
public class ManagerApprovalCheckEndpointTests
{
    private const string CheckUrl = "/v1/manager-approvals/check";

    private const string Requester = "10042";
    private const string Grocery = "Grocery";
    private const string Electronics = "Electronics";

    private const string GroceryManager = "20001";
    private const string ElectronicsManager = "20002";
    private const string StoreManager = "20010";
    private const string UnknownEmployee = "99999";

    // Not digits only. Nothing here validates a PIN's format, and a bare four-digit PIN can turn up
    // inside a logged timing or identifier, which would fail the never-logged assertions at random.
    private const string Pin = "pin-7395";
    private const string WrongPin = "pin-0000";

    private static readonly DateTimeOffset s_morning = new(2026, 10, 1, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Check_EligibleDepartmentManager_Responds200WithTheApprover()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        factory.Realm.Accept(GroceryManager, "Jordan Lee", "department-manager", Grocery);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement data = (await BodyOf(response)).GetProperty("data");
        Assert.Equal("Jordan Lee", data.GetProperty("name").GetString());
        Assert.Equal("DepartmentManager", data.GetProperty("role").GetString());
        Assert.Equal(Grocery, data.GetProperty("department").GetString());
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_EligibleStoreManager_Responds200InAnotherDepartment()
    {
        // Arrange — the Store Manager's own department matches nothing they approve for.
        using var factory = new ManagerApprovalFactory(OnShift(StoreManager));
        factory.Realm.Accept(StoreManager, "Sam Rivera", "store-manager", "Store Operations");
        using var client = RequesterIn(factory, Electronics);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = StoreManager, pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        JsonElement data = (await BodyOf(response)).GetProperty("data");
        Assert.Equal("Sam Rivera", data.GetProperty("name").GetString());
        Assert.Equal("StoreManager", data.GetProperty("role").GetString());
        Assert.Equal("Store Operations", data.GetProperty("department").GetString());
    }

    [Fact]
    public async Task Check_ApprovalSucceeds_EndsOnlyTheChecksOwnSessionAndEchoesNoCredential()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        factory.Realm.Accept(GroceryManager, "Jordan Lee", "department-manager", Grocery);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert — the grant, the identity read, and the logout of the one session the check made.
        string body = await response.Content.ReadAsStringAsync();
        Assert.Equal(
            ["token", "userinfo", "logout"],
            factory.Realm.Requests.Select(request => request.Uri.Segments.Last()).ToArray());
        Assert.DoesNotContain(Pin, body, StringComparison.Ordinal);
        Assert.DoesNotContain("check-access", body, StringComparison.Ordinal);
        Assert.DoesNotContain("check-refresh", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Check_UnknownEmployeeId_Responds422NotRecognized()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory();
        factory.Realm.Respond(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant", "error_description": "Invalid user credentials" }""");
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = UnknownEmployee, pin = Pin });

        // Assert
        await AssertRefusal(response, HttpStatusCode.UnprocessableEntity, "NotRecognized");
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_UnknownIdWrongPinAndLockout_AllAnswerWithTheSameBody()
    {
        // Arrange — an unknown ID and a wrong PIN as Keycloak refuses them, and a locked-out
        // manager whose correct PIN Keycloak refuses under brute-force protection.
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        factory.Realm
            .Respond(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant", "error_description": "Invalid user credentials" }""")
            .Respond(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant", "error_description": "Invalid user credentials" }""")
            .Respond(HttpStatusCode.BadRequest, """{ "error": "invalid_grant", "error_description": "Account temporarily disabled" }""");
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var unknown = await client.PostAsJsonAsync(CheckUrl, new { employeeId = UnknownEmployee, pin = Pin });
        using var wrongPin = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = WrongPin });
        using var lockedOut = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert — one shape for all three, so a refusal never says which it was.
        JsonElement unknownBody = await AssertRefusal(unknown, HttpStatusCode.UnprocessableEntity, "NotRecognized");
        JsonElement wrongPinBody = await AssertRefusal(wrongPin, HttpStatusCode.UnprocessableEntity, "NotRecognized");
        JsonElement lockedOutBody = await AssertRefusal(lockedOut, HttpStatusCode.UnprocessableEntity, "NotRecognized");

        Assert.Equal(Comparable(unknownBody), Comparable(wrongPinBody));
        Assert.Equal(Comparable(wrongPinBody), Comparable(lockedOutBody));
        AssertPinNeverLogged(factory);
        Assert.False(factory.Logs.ContainsText(WrongPin), "The wrong PIN appeared in a log line.");
    }

    [Fact]
    public async Task Check_DepartmentManagerFromAnotherDepartment_Responds422NotEligible()
    {
        // Arrange — good credentials, on shift, but managing Electronics.
        using var factory = new ManagerApprovalFactory(OnShift(ElectronicsManager));
        factory.Realm.Accept(ElectronicsManager, "Riley Chen", "department-manager", Electronics);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = ElectronicsManager, pin = Pin });

        // Assert
        await AssertRefusal(response, HttpStatusCode.UnprocessableEntity, "NotEligible");
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_ManagerOnBreak_Responds422NotEligible()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(
            new AttendanceRecord(GroceryManager, s_morning, breaks: [new BreakInterval(s_morning.AddHours(2))]));
        factory.Realm.Accept(GroceryManager, "Jordan Lee", "department-manager", Grocery);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert
        await AssertRefusal(response, HttpStatusCode.UnprocessableEntity, "NotEligible");
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_ManagerOffShift_Responds422NotEligible()
    {
        // Arrange — clocked in and out earlier, and not clocked in now.
        using var factory = new ManagerApprovalFactory(
            new AttendanceRecord(GroceryManager, s_morning, clockedOutAt: s_morning.AddHours(4)));
        factory.Realm.Accept(GroceryManager, "Jordan Lee", "department-manager", Grocery);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert
        await AssertRefusal(response, HttpStatusCode.UnprocessableEntity, "NotEligible");
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_AssociateWithGoodCredentials_Responds422NotEligible()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift("10050"));
        factory.Realm.Accept("10050", "Avery Brooks", "associate", Grocery);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = "10050", pin = Pin });

        // Assert
        await AssertRefusal(response, HttpStatusCode.UnprocessableEntity, "NotEligible");
    }

    [Fact]
    public async Task Check_NotRecognizedAndNotEligible_AreDistinguishable()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(ElectronicsManager));
        factory.Realm.Respond(HttpStatusCode.Unauthorized, """{ "error": "invalid_grant" }""");
        factory.Realm.Accept(ElectronicsManager, "Riley Chen", "department-manager", Electronics);
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var notRecognized = await client.PostAsJsonAsync(CheckUrl, new { employeeId = UnknownEmployee, pin = Pin });
        using var notEligible = await client.PostAsJsonAsync(CheckUrl, new { employeeId = ElectronicsManager, pin = Pin });

        // Assert — the reason, the title, and the detail all differ.
        JsonElement first = await AssertRefusal(notRecognized, HttpStatusCode.UnprocessableEntity, "NotRecognized");
        JsonElement second = await AssertRefusal(notEligible, HttpStatusCode.UnprocessableEntity, "NotEligible");

        Assert.NotEqual(first.GetProperty("title").GetString(), second.GetProperty("title").GetString());
        Assert.NotEqual(first.GetProperty("detail").GetString(), second.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Check_RealmUnreachable_Responds503Unavailable()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        factory.Realm.Fail(new HttpRequestException("Connection refused"));
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert
        await AssertRefusal(response, HttpStatusCode.ServiceUnavailable, "Unavailable");
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_WithNoBearerToken_Responds401WithoutCheckingTheManager()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert — refused at the pipeline. The realm was never asked about the manager.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Empty(factory.Realm.Requests);
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_WithAnExpiredToken_Responds401WithoutCheckingTheManager()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        using var client = Authenticated(factory, TestRealm.ExpiredToken());

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("invalid_token", response.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);
        Assert.Empty(factory.Realm.Requests);
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_WithATokenSignedByAnUnpublishedKey_Responds401WithoutCheckingTheManager()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        using var client = Authenticated(factory, TestRealm.TokenSignedByAnotherKey());

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(factory.Realm.Requests);
    }

    [Fact]
    public async Task Check_WithNoPin_Responds422ValidationWithoutCheckingTheManager()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager });

        // Assert — a validation failure, which carries field errors and no refusal reason.
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        JsonElement body = await BodyOf(response);
        Assert.True(body.GetProperty("errors").TryGetProperty("pin", out _));
        Assert.False(body.TryGetProperty("reason", out _));
        Assert.Empty(factory.Realm.Requests);
    }

    [Fact]
    public async Task Check_WithNoEmployeeId_Responds422ValidationWithoutCheckingTheManager()
    {
        // Arrange
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        using var client = RequesterIn(factory, Grocery);

        // Act
        using var response = await client.PostAsJsonAsync(CheckUrl, new { pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        JsonElement body = await BodyOf(response);
        Assert.True(body.GetProperty("errors").TryGetProperty("employeeId", out _));
        Assert.Empty(factory.Realm.Requests);
        AssertPinNeverLogged(factory);
    }

    [Fact]
    public async Task Check_ScopesTheRequestToTheRequestersDepartmentFromTheirToken()
    {
        // Arrange — the same Grocery manager, asked for by a Grocery requester and then by an
        // Electronics requester. Nothing in the body names a department.
        using var factory = new ManagerApprovalFactory(OnShift(GroceryManager));
        factory.Realm.Accept(GroceryManager, "Jordan Lee", "department-manager", Grocery);
        factory.Realm.Accept(GroceryManager, "Jordan Lee", "department-manager", Grocery);
        using var groceryRequester = RequesterIn(factory, Grocery);
        using var electronicsRequester = RequesterIn(factory, Electronics);

        // Act
        using var inGrocery = await groceryRequester.PostAsJsonAsync(CheckUrl, new { employeeId = GroceryManager, pin = Pin });
        using var inElectronics = await electronicsRequester.PostAsJsonAsync(
            CheckUrl,
            new { employeeId = GroceryManager, pin = Pin, department = Grocery });

        // Assert — a department in the body is ignored.
        Assert.Equal(HttpStatusCode.OK, inGrocery.StatusCode);
        await AssertRefusal(inElectronics, HttpStatusCode.UnprocessableEntity, "NotEligible");
    }

    private static AttendanceRecord OnShift(string employeeId) => new(employeeId, s_morning);

    private static HttpClient RequesterIn(ManagerApprovalFactory factory, string department) =>
        Authenticated(factory, TestRealm.ValidToken(role: "Associate", department: department, employeeId: Requester));

    private static HttpClient Authenticated(ManagerApprovalFactory factory, string token)
    {
        HttpClient client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response)
    {
        using JsonDocument document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        return document.RootElement.Clone();
    }

    private static async Task<JsonElement> AssertRefusal(HttpResponseMessage response, HttpStatusCode status, string reason)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        JsonElement body = await BodyOf(response);
        Assert.Equal((int)status, body.GetProperty("status").GetInt32());
        Assert.Equal(reason, body.GetProperty("reason").GetString());
        Assert.False(body.TryGetProperty("data", out _));
        Assert.DoesNotContain(Pin, body.GetRawText(), StringComparison.Ordinal);

        return body;
    }

    // Everything a client could branch on. The trace ID and request path are left out, because
    // they differ per request by design.
    private static string Comparable(JsonElement body) =>
        string.Join(
            "|",
            body.GetProperty("status").GetInt32(),
            body.GetProperty("title").GetString(),
            body.GetProperty("detail").GetString(),
            body.GetProperty("reason").GetString());

    private static void AssertPinNeverLogged(ManagerApprovalFactory factory)
    {
        Assert.NotEmpty(factory.Logs.Lines);
        Assert.False(factory.Logs.ContainsText(Pin), "The PIN appeared in a log line.");
    }
}

/// <summary>Queues the realm's three answers to a credential check that succeeds.</summary>
internal static class RealmResponses
{
    public static RecordingHandler Accept(
        this RecordingHandler realm,
        string employeeId,
        string name,
        string storeRole,
        string department) =>
        realm
            .Respond(HttpStatusCode.OK, """{ "access_token": "check-access", "refresh_token": "check-refresh" }""")
            .Respond(HttpStatusCode.OK, JsonSerializer.Serialize(new
            {
                sub = $"u-{employeeId}",
                preferred_username = employeeId,
                name,
                store_role = storeRole,
                department,
                job_function = "Management",
            }))
            .Respond(HttpStatusCode.NoContent);
}

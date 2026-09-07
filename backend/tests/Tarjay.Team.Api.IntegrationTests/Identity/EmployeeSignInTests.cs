using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Tarjay.Team.Domain.Identity;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests.Identity;

public class EmployeeSignInTests
{
    private const string SignInUrl = "/v1/employees/sign-in";
    private const string Pin = "8321";

    [Fact]
    public async Task SignIn_WithValidCredentials_ReturnsRoleDepartmentAndJobFunction()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (employeeId, _) => new EmployeeIdentity
        {
            EmployeeId = employeeId,
            Name = "Avery Brooks",
            Role = EmployeeRole.DepartmentManager,
            Department = "Grocery",
            JobFunction = "Customer Support",
        };

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = body.RootElement.GetProperty("data");

        Assert.Equal("100482", data.GetProperty("employeeId").GetString());
        Assert.Equal("Avery Brooks", data.GetProperty("name").GetString());
        Assert.Equal("DepartmentManager", data.GetProperty("role").GetString());
        Assert.Equal("Grocery", data.GetProperty("department").GetString());
        Assert.Equal("Customer Support", data.GetProperty("jobFunction").GetString());
    }

    [Fact]
    public async Task SignIn_WithValidCredentials_WrapsTheIdentityInTheSuccessEnvelope()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — one shape for every success response, including a single resource.
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.True(body.RootElement.TryGetProperty("data", out _));
        Assert.True(body.RootElement.TryGetProperty("meta", out var meta));
        Assert.Equal(JsonValueKind.Object, meta.ValueKind);
    }

    [Theory]
    [InlineData(EmployeeRole.Associate, "Associate")]
    [InlineData(EmployeeRole.DepartmentManager, "DepartmentManager")]
    [InlineData(EmployeeRole.StoreManager, "StoreManager")]
    [InlineData(EmployeeRole.ReceivingAssociate, "ReceivingAssociate")]
    public async Task SignIn_ForEachRole_ReturnsTheRoleByName(EmployeeRole role, string expected)
    {
        // Arrange — each of the four roles reaches the frontend as a stable name, never an ordinal.
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (employeeId, _) => new EmployeeIdentity
        {
            EmployeeId = employeeId,
            Name = "Avery Brooks",
            Role = role,
            Department = "Grocery",
            JobFunction = "Register",
        };

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(expected, body.RootElement.GetProperty("data").GetProperty("role").GetString());
    }

    [Fact]
    public async Task SignIn_WithInvalidCredentials_IsRejectedWithoutAnyEmployeeData()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new InvalidEmployeeCredentialsException();

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = "0000" });

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var raw = await response.Content.ReadAsStringAsync();

        using var body = JsonDocument.Parse(raw);
        Assert.False(body.RootElement.TryGetProperty("data", out _));
        Assert.DoesNotContain("Grocery", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("Associate", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task SignIn_WithInvalidCredentials_DoesNotRevealWhichFieldWasWrong()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new InvalidEmployeeCredentialsException();

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = "0000" });

        // Assert
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var detail = body.RootElement.GetProperty("detail").GetString();

        Assert.Equal("The Employee ID or PIN is not valid.", detail);
    }

    [Fact]
    public async Task SignIn_WhenTheProviderIsUnreachable_IsAHardBlockWithNoIdentity()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new IdentityProviderUnreachableException("the connection failed");

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — no cached or fallback identity is served in place of the real one.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(body.RootElement.TryGetProperty("data", out _));
    }

    [Fact]
    public async Task SignIn_RejectionAndUnreachableProvider_AreDistinguishableByTheCaller()
    {
        // Arrange
        using var rejecting = new EmployeeSignInFactory();
        rejecting.Resolver.Behavior = (_, _) => throw new InvalidEmployeeCredentialsException();

        using var unreachable = new EmployeeSignInFactory();
        unreachable.Resolver.Behavior = (_, _) => throw new IdentityProviderUnreachableException("the connection failed");

        using var rejectingClient = rejecting.CreateClient();
        using var unreachableClient = unreachable.CreateClient();

        var credentials = new { employeeId = "100482", pin = Pin };

        // Act
        using var rejection = await rejectingClient.PostAsJsonAsync(SignInUrl, credentials);
        using var outage = await unreachableClient.PostAsJsonAsync(SignInUrl, credentials);

        // Assert — the frontend has to tell "your PIN was wrong" from "the store cannot reach
        // corporate", because they call for completely different things from the employee.
        Assert.NotEqual(rejection.StatusCode, outage.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, rejection.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, outage.StatusCode);
    }

    [Fact]
    public async Task SignIn_WhenTheProviderReturnsAnUnusableIdentity_ReturnsBadGateway()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) =>
            throw new EmployeeIdentityIncompleteException("no department claim was supplied");

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — distinct from both siblings: the credentials were good and the provider answered.
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task SignIn_ForEachDomainFailure_NeverFallsThroughToTheGenericHandler(HttpStatusCode expected)
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw (Exception)(expected switch
        {
            HttpStatusCode.Unauthorized => new InvalidEmployeeCredentialsException(),
            HttpStatusCode.ServiceUnavailable => new IdentityProviderUnreachableException("the connection failed"),
            _ => new EmployeeIdentityIncompleteException("no department claim was supplied"),
        });

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — the aggregate's own handler claimed it, so it is never a bare 500, and it
        // always carries a ProblemDetails body rather than nothing.
        Assert.Equal(expected, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);

        var raw = await response.Content.ReadAsStringAsync();
        Assert.False(string.IsNullOrWhiteSpace(raw));

        using var body = JsonDocument.Parse(raw);
        Assert.Equal((int)expected, body.RootElement.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task SignIn_OnAnUnexpectedFailure_ReturnsABareInternalServerErrorWithNoBody()
    {
        // Arrange — something no aggregate handler recognizes.
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new InvalidOperationException("something nobody anticipated");

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — the absence of a payload is itself the signal that this was not a handled
        // domain failure.
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task SignIn_OnAnUnexpectedFailure_StillLogsTheWholeException()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new InvalidOperationException("something nobody anticipated");

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — the caller is told nothing, so the logs are the only remaining record.
        Assert.True(factory.Logs.ContainsText("something nobody anticipated"));
    }

    [Fact]
    public async Task SignIn_WithNoEmployeeId_IsRejectedBeforeTheProviderIsCalled()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(factory.Resolver.Calls);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var errors = body.RootElement.GetProperty("errors");

        Assert.True(errors.TryGetProperty("employeeId", out var employeeIdErrors));
        Assert.Contains("An Employee ID is required.", employeeIdErrors.EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task SignIn_WithNoPin_IsRejectedBeforeTheProviderIsCalled()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482" });

        // Assert
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(factory.Resolver.Calls);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var errors = body.RootElement.GetProperty("errors");

        Assert.True(errors.TryGetProperty("pin", out var pinErrors));
        Assert.Contains("A PIN is required.", pinErrors.EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task SignIn_WithBothFieldsMissing_NamesBothOfThem()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsync(
            SignInUrl,
            new StringContent("{}", Encoding.UTF8, "application/json"));

        // Assert
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(factory.Resolver.Calls);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var errors = body.RootElement.GetProperty("errors");

        Assert.True(errors.TryGetProperty("employeeId", out _));
        Assert.True(errors.TryGetProperty("pin", out _));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task SignIn_WithBlankCredentials_IsRejectedBeforeTheProviderIsCalled(string blank)
    {
        // Arrange — present but empty is the same failure as absent, and is equally not a
        // question worth asking Keycloak.
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = blank, pin = blank });

        // Assert
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(factory.Resolver.Calls);
    }

    [Fact]
    public async Task SignIn_WhenValidationFails_DoesNotUseTheSuccessEnvelope()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { pin = Pin });

        // Assert — a failure body stands alone at the top level, never wrapped in { data, meta }.
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.False(body.RootElement.TryGetProperty("data", out _));
        Assert.False(body.RootElement.TryGetProperty("meta", out _));
        Assert.True(body.RootElement.TryGetProperty("errors", out _));
    }

    [Fact]
    public async Task SignIn_OnSuccess_NeverLogsThePin()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEmpty(factory.Logs.Lines);
        Assert.False(
            factory.Logs.ContainsText(Pin),
            $"The PIN appeared in a log line: {string.Join(" | ", factory.Logs.Lines)}");
    }

    [Fact]
    public async Task SignIn_OnRejection_NeverLogsThePin()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new InvalidEmployeeCredentialsException();

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(
            factory.Logs.ContainsText(Pin),
            $"The PIN appeared in a log line: {string.Join(" | ", factory.Logs.Lines)}");
    }

    [Fact]
    public async Task SignIn_OnAnUnexpectedFailure_NeverLogsThePin()
    {
        // Arrange — the fallback handler logs the entire exception, which is the likeliest place
        // for a credential to leak into the logs by accident.
        using var factory = new EmployeeSignInFactory();
        factory.Resolver.Behavior = (_, _) => throw new InvalidOperationException("something nobody anticipated");

        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.False(
            factory.Logs.ContainsText(Pin),
            $"The PIN appeared in a log line: {string.Join(" | ", factory.Logs.Lines)}");
    }

    [Fact]
    public async Task SignIn_OnSuccess_PassesTheSubmittedCredentialsToTheProvider()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.PostAsJsonAsync(SignInUrl, new { employeeId = "100482", pin = Pin });

        // Assert — the provider is the only thing that verifies a credential, so the endpoint has
        // to hand it exactly what the employee typed.
        var call = Assert.Single(factory.Resolver.Calls);
        Assert.Equal("100482", call.EmployeeId);
        Assert.Equal(Pin, call.Pin);
    }

    [Fact]
    public async Task SignIn_ByAnyMethodOtherThanPost_IsNotAllowed()
    {
        // Arrange
        using var factory = new EmployeeSignInFactory();
        using var client = factory.CreateClient();

        // Act
        using var response = await client.GetAsync(SignInUrl);

        // Assert — signing in changes state; it is not something a link can do.
        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }
}

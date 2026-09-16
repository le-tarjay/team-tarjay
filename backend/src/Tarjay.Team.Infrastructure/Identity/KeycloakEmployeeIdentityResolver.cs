using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Infrastructure.Identity;

/// <summary>
/// Resolves an employee's identity through Keycloak, using the OIDC password grant to verify the
/// Employee ID and PIN and the userinfo endpoint to read the role, department, and job function the
/// realm holds for that employee.
/// </summary>
/// <remarks>
/// Two calls, and the split is deliberate: the token endpoint is the credential check, the userinfo
/// endpoint is the identity lookup. Keeping them separate is what lets a rejected credential and a
/// misconfigured employee record surface as different failures instead of one vague one.
/// </remarks>
public sealed class KeycloakEmployeeIdentityResolver : IEmployeeIdentityResolver
{
    private readonly HttpClient _httpClient;
    private readonly KeycloakOptions _options;
    private readonly ILogger<KeycloakEmployeeIdentityResolver> _logger;

    /// <summary>Initializes the resolver.</summary>
    public KeycloakEmployeeIdentityResolver(
        HttpClient httpClient,
        IOptions<KeycloakOptions> options,
        ILogger<KeycloakEmployeeIdentityResolver> logger)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(logger);

        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<EmployeeIdentity> ResolveAsync(string employeeId, string pin, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);
        ArgumentException.ThrowIfNullOrWhiteSpace(pin);

        var accessToken = await RequestAccessTokenAsync(employeeId, pin, cancellationToken);
        var identity = await ReadIdentityAsync(employeeId, accessToken, cancellationToken);

        // Note the absence of the PIN here, and in every other log line on this path: the
        // Employee ID identifies the sign-in for anyone reading the logs, and the PIN is never
        // what makes a log line useful.
        _logger.LogInformation(
            "Employee {EmployeeId} signed in as {Role} in {Department}",
            identity.EmployeeId,
            identity.Role,
            identity.Department);

        return identity;
    }

    private async Task<string> RequestAccessTokenAsync(string employeeId, string pin, CancellationToken cancellationToken)
    {
        var form = new List<KeyValuePair<string, string>>
        {
            new("grant_type", "password"),
            new("client_id", _options.ClientId),
            new("username", employeeId),
            new("password", pin),
            new("scope", "openid profile"),
        };

        if (!string.IsNullOrEmpty(_options.ClientSecret))
        {
            form.Add(new KeyValuePair<string, string>("client_secret", _options.ClientSecret));
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl("token"))
        {
            Content = new FormUrlEncodedContent(form),
        };

        using var response = await SendAsync(request, employeeId, cancellationToken);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.BadRequest or HttpStatusCode.Forbidden)
        {
            // Keycloak answered, and its answer was "no". That is a rejected credential, not an
            // unreachable authority — the two must never collapse into one another.
            _logger.LogWarning(
                "Sign-in rejected for employee {EmployeeId}: the identity provider did not accept the credentials",
                employeeId);

            throw new InvalidEmployeeCredentialsException();
        }

        if (!response.IsSuccessStatusCode)
        {
            // Any other non-success is Keycloak failing rather than judging — a 500, a 502 from a
            // proxy in front of it, a 404 from a realm that is not there. None of those are a
            // statement about this employee's credentials, so none of them may be reported as one.
            throw Unreachable(
                FormattableString.Invariant($"the token endpoint returned {(int)response.StatusCode}"),
                employeeId);
        }

        using var payload = await ReadJsonAsync(response, employeeId, cancellationToken);

        if (!payload.RootElement.TryGetProperty("access_token", out var accessToken)
            || accessToken.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(accessToken.GetString()))
        {
            throw Unreachable("the token endpoint returned no access token", employeeId);
        }

        return accessToken.GetString()!;
    }

    private async Task<EmployeeIdentity> ReadIdentityAsync(
        string employeeId,
        string accessToken,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildUrl("userinfo"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await SendAsync(request, employeeId, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            // The credentials were already accepted, so a failure here is the authority failing
            // mid-handshake, not a credential problem.
            throw Unreachable(
                FormattableString.Invariant($"the userinfo endpoint returned {(int)response.StatusCode}"),
                employeeId);
        }

        using var payload = await ReadJsonAsync(response, employeeId, cancellationToken);
        var claims = payload.RootElement;

        var department = ReadClaim(claims, _options.DepartmentClaim);
        if (string.IsNullOrWhiteSpace(department))
        {
            throw Incomplete(FormattableString.Invariant($"no {_options.DepartmentClaim} claim was supplied"), employeeId);
        }

        var jobFunction = ReadClaim(claims, _options.JobFunctionClaim);
        if (string.IsNullOrWhiteSpace(jobFunction))
        {
            throw Incomplete(FormattableString.Invariant($"no {_options.JobFunctionClaim} claim was supplied"), employeeId);
        }

        var roleClaim = ReadClaim(claims, _options.RoleClaim);
        if (string.IsNullOrWhiteSpace(roleClaim))
        {
            throw Incomplete(FormattableString.Invariant($"no {_options.RoleClaim} claim was supplied"), employeeId);
        }

        if (!TryParseRole(roleClaim, out var role))
        {
            // An unrecognized tier is not defaulted to Associate. Guessing downward would hand
            // someone the wrong authority quietly, which is worse than refusing the sign-in.
            throw Incomplete(
                FormattableString.Invariant($"the {_options.RoleClaim} claim was \"{roleClaim}\", which is not one of the four roles the store recognizes"),
                employeeId);
        }

        return new EmployeeIdentity
        {
            EmployeeId = ReadClaim(claims, "preferred_username") ?? employeeId,
            Name = ReadClaim(claims, "name") ?? ReadClaim(claims, "preferred_username") ?? employeeId,
            Role = role,
            Department = department,
            JobFunction = jobFunction,
        };
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        string employeeId,
        CancellationToken cancellationToken)
    {
        try
        {
            return await _httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw Unreachable("the connection failed", employeeId, exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            // The client's own timeout elapsed, rather than the caller giving up. A timed-out
            // authority is an unreachable authority; it is emphatically not a wrong PIN.
            throw Unreachable("the request timed out", employeeId, exception);
        }
    }

    private async Task<JsonDocument> ReadJsonAsync(
        HttpResponseMessage response,
        string employeeId,
        CancellationToken cancellationToken)
    {
        try
        {
            var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            await using (stream)
            {
                return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            }
        }
        catch (JsonException exception)
        {
            throw Unreachable("the response was not valid JSON", employeeId, exception);
        }
        catch (HttpRequestException exception)
        {
            throw Unreachable("the connection failed while reading the response", employeeId, exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw Unreachable("the request timed out", employeeId, exception);
        }
    }

    private IdentityProviderUnreachableException Unreachable(string reason, string employeeId, Exception? inner = null)
    {
        _logger.LogWarning(
            "Sign-in for employee {EmployeeId} could not be resolved: {Reason}",
            employeeId,
            reason);

        return inner is null
            ? new IdentityProviderUnreachableException(reason)
            : new IdentityProviderUnreachableException(reason, inner);
    }

    private EmployeeIdentityIncompleteException Incomplete(string detail, string employeeId)
    {
        _logger.LogWarning(
            "Employee {EmployeeId} authenticated but the identity provider returned an unusable identity: {Detail}",
            employeeId,
            detail);

        return new EmployeeIdentityIncompleteException(detail);
    }

    private string BuildUrl(string endpoint) =>
        FormattableString.Invariant(
            $"{_options.Authority.TrimEnd('/')}/realms/{_options.Realm}/protocol/openid-connect/{endpoint}");

    private static string? ReadClaim(JsonElement claims, string claimName)
    {
        if (claims.ValueKind != JsonValueKind.Object
            || !claims.TryGetProperty(claimName, out var claim))
        {
            return null;
        }

        return claim.ValueKind switch
        {
            JsonValueKind.String => claim.GetString(),

            // Keycloak renders a multi-valued user attribute as an array even when a single value
            // is configured, so a one-element array is read as that value rather than refused.
            JsonValueKind.Array => claim.EnumerateArray()
                .Where(element => element.ValueKind == JsonValueKind.String)
                .Select(element => element.GetString())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)),

            _ => null,
        };
    }

    private static bool TryParseRole(string roleClaim, out EmployeeRole role)
    {
        // Compared with separators and casing stripped, so "department-manager",
        // "department_manager", and "DepartmentManager" all resolve to the same tier. The realm's
        // choice of spelling is not something this store should be brittle about.
        var normalized = new string(roleClaim.Where(char.IsLetterOrDigit).ToArray())
            .ToLower(CultureInfo.InvariantCulture);

        switch (normalized)
        {
            case "associate":
                role = EmployeeRole.Associate;
                return true;
            case "departmentmanager":
                role = EmployeeRole.DepartmentManager;
                return true;
            case "storemanager":
                role = EmployeeRole.StoreManager;
                return true;
            case "receivingassociate":
                role = EmployeeRole.ReceivingAssociate;
                return true;
            default:
                role = default;
                return false;
        }
    }
}

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
/// Resolves an employee's session through Keycloak, using the OIDC password grant to verify the
/// Employee ID and PIN, the userinfo endpoint to read the role, department, and job function the
/// realm holds for that employee, and the Admin API to end whatever other sessions that employee
/// still holds.
/// </summary>
/// <remarks>
/// The first two calls are split deliberately: the token endpoint is the credential check, the
/// userinfo endpoint is the identity lookup. Keeping them separate is what lets a rejected
/// credential and a misconfigured employee record surface as different failures instead of one
/// vague one. The third — ending the employee's other sessions — happens before this method
/// returns and not in the background, so a caller holding a session knows it is the only one. The
/// tokens the password grant issued are passed back untouched; this store mints nothing of its own.
/// </remarks>
public sealed class KeycloakEmployeeIdentityResolver : IEmployeeIdentityResolver
{
    private readonly HttpClient _httpClient;
    private readonly IKeycloakSessionAdministrator _sessionAdministrator;
    private readonly KeycloakOptions _options;
    private readonly ILogger<KeycloakEmployeeIdentityResolver> _logger;

    /// <summary>Initializes the resolver.</summary>
    public KeycloakEmployeeIdentityResolver(
        HttpClient httpClient,
        IKeycloakSessionAdministrator sessionAdministrator,
        IOptions<KeycloakOptions> options,
        ILogger<KeycloakEmployeeIdentityResolver> logger)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(sessionAdministrator);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(logger);

        _httpClient = httpClient;
        _sessionAdministrator = sessionAdministrator;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<EmployeeSession> ResolveAsync(string employeeId, string pin, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);
        ArgumentException.ThrowIfNullOrWhiteSpace(pin);

        var grant = await RequestGrantAsync(employeeId, pin, cancellationToken);
        var (identity, subject) = await ReadIdentityAsync(employeeId, grant.AccessToken, cancellationToken);

        // Before the session is handed back, never after. A caller that got a session may rely on
        // it being this employee's only live one, and a termination still in flight would make
        // that a guess rather than a guarantee.
        await _sessionAdministrator.TerminateOtherSessionsAsync(subject, grant.SessionState, cancellationToken);

        // Note the absence of the PIN here, and in every other log line on this path: the
        // Employee ID identifies the sign-in for anyone reading the logs, and the PIN is never
        // what makes a log line useful. The tokens are held to the same rule.
        _logger.LogInformation(
            "Employee {EmployeeId} signed in as {Role} in {Department}",
            identity.EmployeeId,
            identity.Role,
            identity.Department);

        return new EmployeeSession
        {
            Identity = identity,
            AccessToken = grant.AccessToken,
            RefreshToken = grant.RefreshToken,
        };
    }

    private async Task<TokenGrant> RequestGrantAsync(string employeeId, string pin, CancellationToken cancellationToken)
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

        var accessToken = ReadString(payload.RootElement, "access_token");
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw Unreachable("the token endpoint returned no access token", employeeId);
        }

        // Kept rather than discarded: the device refreshes on its own schedule, and that refresh is
        // also how a device whose session was ended elsewhere finds out. Without this it could not.
        var refreshToken = ReadString(payload.RootElement, "refresh_token");
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw Unreachable("the token endpoint returned no refresh token", employeeId);
        }

        var sessionState = ReadString(payload.RootElement, "session_state");
        if (string.IsNullOrWhiteSpace(sessionState))
        {
            // Without it there is no way to tell the session just created from the ones that are
            // meant to end, and the only safe answers left are "end nothing" or "end everything
            // including this one". Both break the promise quietly, so this fails loudly instead.
            throw CannotTerminate(
                "the token endpoint named no session, so this sign-in's own session cannot be told apart from the employee's others",
                employeeId);
        }

        return new TokenGrant(accessToken, refreshToken, sessionState);
    }

    private async Task<(EmployeeIdentity Identity, string Subject)> ReadIdentityAsync(
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

        // The realm's own id for this employee, which is what the Admin API answers to — the
        // Employee ID they typed is a username, and asking the Admin API about a username means a
        // search that could match more than one person.
        var subject = ReadClaim(claims, "sub");
        if (string.IsNullOrWhiteSpace(subject))
        {
            throw Incomplete("no sub claim was supplied", employeeId);
        }

        var identity = new EmployeeIdentity
        {
            EmployeeId = ReadClaim(claims, "preferred_username") ?? employeeId,
            Name = ReadClaim(claims, "name") ?? ReadClaim(claims, "preferred_username") ?? employeeId,
            Role = role,
            Department = department,
            JobFunction = jobFunction,
        };

        return (identity, subject);
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

    private SessionTerminationFailedException CannotTerminate(string reason, string employeeId)
    {
        _logger.LogWarning(
            "Sign-in for employee {EmployeeId} was refused because their other sessions could not be ended: {Reason}",
            employeeId,
            reason);

        return new SessionTerminationFailedException(reason);
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

    private static string? ReadString(JsonElement payload, string propertyName)
    {
        if (payload.ValueKind != JsonValueKind.Object
            || !payload.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return property.GetString();
    }

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

    /// <summary>
    /// What the password grant answered with: the two tokens the device keeps, and the realm's own
    /// name for the session they belong to.
    /// </summary>
    private sealed record TokenGrant(string AccessToken, string RefreshToken, string SessionState);
}

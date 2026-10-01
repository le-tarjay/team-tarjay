using System;
using System.Collections.Generic;
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
/// Checks an approving manager's Employee ID and PIN with Keycloak and reads whose they are,
/// leaving every session the manager already holds alone.
/// </summary>
/// <remarks>
/// <para>
/// Three calls, all to the realm the store is configured with. The OIDC password grant verifies
/// the credentials. The userinfo endpoint reads the identity, through the same shared claims read
/// sign-in uses. The OIDC logout endpoint then ends the one session the grant created, named by
/// the refresh token that grant issued.
/// </para>
/// <para>
/// It never calls the Admin API and never lists the manager's sessions, so none of the manager's
/// other sessions can be touched. Every token it is issued is discarded here and never leaves this
/// class.
/// </para>
/// </remarks>
public sealed class KeycloakApproverCredentialCheck : IApproverCredentialCheck
{
    private readonly HttpClient _httpClient;
    private readonly KeycloakOptions _options;
    private readonly ILogger<KeycloakApproverCredentialCheck> _logger;

    /// <summary>Initializes the check.</summary>
    public KeycloakApproverCredentialCheck(
        HttpClient httpClient,
        IOptions<KeycloakOptions> options,
        ILogger<KeycloakApproverCredentialCheck> logger)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(logger);

        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<ApproverCredentialCheckResult> CheckAsync(
        string employeeId,
        string pin,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(employeeId);
        ArgumentException.ThrowIfNullOrWhiteSpace(pin);

        TokenGrant? grant;

        try
        {
            grant = await RequestGrantAsync(employeeId, pin, cancellationToken);
        }
        catch (IdentityProviderUnreachableException)
        {
            return ApproverCredentialCheckResult.Unreachable();
        }

        if (grant is null)
        {
            return ApproverCredentialCheckResult.NotValid();
        }

        var sessionEndAttempted = false;

        try
        {
            var identity = await ReadIdentityAsync(employeeId, grant.AccessToken, cancellationToken);

            sessionEndAttempted = true;
            if (!await EndCheckSessionAsync(employeeId, grant.RefreshToken))
            {
                return ApproverCredentialCheckResult.Unreachable();
            }

            // The Employee ID identifies the check for anyone reading the logs. The PIN and the
            // tokens never appear in this line or any other on this path.
            _logger.LogInformation(
                "Approver credentials accepted for employee {EmployeeId}, a {Role} in {Department}",
                identity.EmployeeId,
                identity.Role,
                identity.Department);

            return ApproverCredentialCheckResult.Valid(identity);
        }
        catch (IdentityProviderUnreachableException)
        {
            return ApproverCredentialCheckResult.Unreachable();
        }
        finally
        {
            // Reached without an attempt only when the identity read failed or the caller gave up.
            // The session the grant created is ended either way, so a failed check leaves nothing
            // behind.
            if (!sessionEndAttempted)
            {
                await EndCheckSessionAsync(employeeId, grant.RefreshToken);
            }
        }
    }

    private async Task<TokenGrant?> RequestGrantAsync(string employeeId, string pin, CancellationToken cancellationToken)
    {
        var form = new List<KeyValuePair<string, string>>
        {
            new("grant_type", "password"),
            new("client_id", _options.ClientId),
            new("username", employeeId),
            new("password", pin),
            new("scope", "openid profile"),
        };

        AddClientSecret(form);

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl("token"))
        {
            Content = new FormUrlEncodedContent(form),
        };

        using var response = await SendAsync(request, employeeId, cancellationToken);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.BadRequest or HttpStatusCode.Forbidden)
        {
            // Keycloak answered "no". A wrong PIN, an unknown Employee ID, and a manager under the
            // realm's brute-force lockout all arrive here and are reported the same way.
            _logger.LogWarning(
                "Approver credentials refused for employee {EmployeeId}: the identity provider did not accept them",
                employeeId);

            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw Unreachable(
                FormattableString.Invariant($"the token endpoint returned {(int)response.StatusCode}"),
                employeeId);
        }

        using var payload = await ReadJsonAsync(response, employeeId, cancellationToken);

        var accessToken = KeycloakIdentityClaims.ReadClaim(payload.RootElement, "access_token");
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw Unreachable("the token endpoint returned no access token", employeeId);
        }

        // The refresh token is what names the session this check created, so that session can be
        // ended without asking about any other.
        var refreshToken = KeycloakIdentityClaims.ReadClaim(payload.RootElement, "refresh_token");
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw Unreachable(
                "the token endpoint returned no refresh token, so the session the check created cannot be ended",
                employeeId);
        }

        return new TokenGrant(accessToken, refreshToken);
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
            // The credentials were already accepted, so this is the authority failing
            // mid-check rather than a credential problem.
            throw Unreachable(
                FormattableString.Invariant($"the userinfo endpoint returned {(int)response.StatusCode}"),
                employeeId);
        }

        using var payload = await ReadJsonAsync(response, employeeId, cancellationToken);
        var claims = payload.RootElement;

        // The shared read. An empty department or job function is passed through as empty, and
        // the eligibility rule decides what an empty department means.
        var authority = KeycloakIdentityClaims.ReadAuthority(
            claims,
            _options,
            detail => Incomplete(detail, employeeId));

        return new EmployeeIdentity
        {
            EmployeeId = KeycloakIdentityClaims.ReadClaim(claims, "preferred_username") ?? employeeId,
            Name = KeycloakIdentityClaims.ReadClaim(claims, "name")
                ?? KeycloakIdentityClaims.ReadClaim(claims, "preferred_username")
                ?? employeeId,
            Role = authority.Role,
            Department = authority.Department,
            JobFunction = authority.JobFunction,
        };
    }

    private async Task<bool> EndCheckSessionAsync(string employeeId, string refreshToken)
    {
        var form = new List<KeyValuePair<string, string>>
        {
            new("client_id", _options.ClientId),
            new("refresh_token", refreshToken),
        };

        AddClientSecret(form);

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl("logout"))
        {
            Content = new FormUrlEncodedContent(form),
        };

        // Not the caller's token. A caller that gives up after the grant still gets the session
        // the check created ended. The client's own timeout bounds the wait.
        try
        {
            using var response = await _httpClient.SendAsync(request, CancellationToken.None);

            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            _logger.LogWarning(
                "The session an approver credential check created for employee {EmployeeId} could not be ended: the logout endpoint returned {StatusCode}",
                employeeId,
                (int)response.StatusCode);
        }
        catch (HttpRequestException)
        {
            _logger.LogWarning(
                "The session an approver credential check created for employee {EmployeeId} could not be ended: the connection failed",
                employeeId);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning(
                "The session an approver credential check created for employee {EmployeeId} could not be ended: the request timed out",
                employeeId);
        }

        return false;
    }

    private void AddClientSecret(List<KeyValuePair<string, string>> form)
    {
        if (!string.IsNullOrEmpty(_options.ClientSecret))
        {
            form.Add(new KeyValuePair<string, string>("client_secret", _options.ClientSecret));
        }
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
            // The client's own timeout elapsed, rather than the caller giving up.
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
            "Approver credentials for employee {EmployeeId} could not be checked: {Reason}",
            employeeId,
            reason);

        return inner is null
            ? new IdentityProviderUnreachableException(reason)
            : new IdentityProviderUnreachableException(reason, inner);
    }

    private EmployeeIdentityIncompleteException Incomplete(string detail, string employeeId)
    {
        _logger.LogWarning(
            "Approver credentials for employee {EmployeeId} were accepted but the identity provider returned an unusable identity: {Detail}",
            employeeId,
            detail);

        return new EmployeeIdentityIncompleteException(detail);
    }

    private string BuildUrl(string endpoint) =>
        FormattableString.Invariant(
            $"{_options.Authority.TrimEnd('/')}/realms/{_options.Realm}/protocol/openid-connect/{endpoint}");

    /// <summary>
    /// The two tokens the password grant issued. The access token reads the identity. The refresh
    /// token names the session to end.
    /// </summary>
    private sealed record TokenGrant(string AccessToken, string RefreshToken);
}

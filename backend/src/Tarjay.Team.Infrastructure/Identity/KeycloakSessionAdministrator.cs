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
/// Ends an employee's other Keycloak sessions through Keycloak's Admin API, authenticated as the
/// confidential client's service account.
/// </summary>
/// <remarks>
/// Sessions are ended one at a time, by id, rather than through the Admin API's "log the user out"
/// endpoint. That endpoint ends every session the employee holds — including the one the sign-in
/// happening right now just created, which would hand the employee a token pair already dead on
/// arrival. Naming the sessions to end is what makes "their other sessions" mean what it says.
/// </remarks>
public sealed class KeycloakSessionAdministrator : IKeycloakSessionAdministrator
{
    private readonly HttpClient _httpClient;
    private readonly KeycloakOptions _options;
    private readonly ILogger<KeycloakSessionAdministrator> _logger;

    /// <summary>Initializes the administrator.</summary>
    public KeycloakSessionAdministrator(
        HttpClient httpClient,
        IOptions<KeycloakOptions> options,
        ILogger<KeycloakSessionAdministrator> logger)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(logger);

        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<int> TerminateOtherSessionsAsync(
        string userId,
        string currentSessionId,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);
        ArgumentException.ThrowIfNullOrWhiteSpace(currentSessionId);

        if (string.IsNullOrWhiteSpace(_options.Admin.ClientId)
            || string.IsNullOrWhiteSpace(_options.Admin.ClientSecret))
        {
            // Refused rather than skipped. An unconfigured admin client is a deployment that cannot
            // keep the single-session promise, and signing people in as though it could is worse
            // than not signing them in at all.
            throw Failed("no administration client is configured");
        }

        var adminToken = await RequestAdminTokenAsync(cancellationToken);
        var sessionIds = await ReadSessionIdsAsync(userId, adminToken, cancellationToken);

        var ended = 0;

        foreach (var sessionId in sessionIds)
        {
            if (string.Equals(sessionId, currentSessionId, StringComparison.Ordinal))
            {
                continue;
            }

            if (await DeleteSessionAsync(sessionId, adminToken, cancellationToken))
            {
                ended++;
            }
        }

        // Zero is the ordinary case — most sign-ins have nothing else open — so this is logged at
        // Information either way rather than only when something was actually ended.
        _logger.LogInformation(
            "Ended {SessionCount} other session(s) for Keycloak user {UserId} on sign-in",
            ended,
            userId);

        return ended;
    }

    private async Task<string> RequestAdminTokenAsync(CancellationToken cancellationToken)
    {
        var form = new List<KeyValuePair<string, string>>
        {
            new("grant_type", "client_credentials"),
            new("client_id", _options.Admin.ClientId),
            new("client_secret", _options.Admin.ClientSecret),
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildTokenUrl())
        {
            Content = new FormUrlEncodedContent(form),
        };

        using var response = await SendAsync(request, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            // Including 401: that is the store's own service account being refused, which is a
            // misconfiguration on this side, not anything to do with the employee signing in.
            throw Failed(FormattableString.Invariant(
                $"the service account could not be authenticated (the token endpoint returned {(int)response.StatusCode})"));
        }

        using var payload = await ReadJsonAsync(response, cancellationToken);

        if (!payload.RootElement.TryGetProperty("access_token", out var accessToken)
            || accessToken.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(accessToken.GetString()))
        {
            throw Failed("the token endpoint issued the service account no access token");
        }

        return accessToken.GetString()!;
    }

    private async Task<IReadOnlyList<string>> ReadSessionIdsAsync(
        string userId,
        string adminToken,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildAdminUrl(
            FormattableString.Invariant($"users/{Uri.EscapeDataString(userId)}/sessions")));

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        using var response = await SendAsync(request, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw Failed(FormattableString.Invariant(
                $"the employee's sessions could not be listed (the admin API returned {(int)response.StatusCode})"));
        }

        using var payload = await ReadJsonAsync(response, cancellationToken);

        if (payload.RootElement.ValueKind != JsonValueKind.Array)
        {
            throw Failed("the admin API did not answer the session list with a list");
        }

        var sessionIds = new List<string>();

        foreach (var session in payload.RootElement.EnumerateArray())
        {
            if (session.ValueKind == JsonValueKind.Object
                && session.TryGetProperty("id", out var id)
                && id.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(id.GetString()))
            {
                sessionIds.Add(id.GetString()!);
            }
        }

        return sessionIds;
    }

    private async Task<bool> DeleteSessionAsync(
        string sessionId,
        string adminToken,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, BuildAdminUrl(
            FormattableString.Invariant($"sessions/{Uri.EscapeDataString(sessionId)}")));

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        using var response = await SendAsync(request, cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            // The session ended between listing it and deleting it — it expired, or a second
            // sign-in elsewhere got to it first. Either way it is gone, which is what was asked
            // for, so this is not a failure. It is not counted as ended, because this call is not
            // what ended it.
            return false;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw Failed(FormattableString.Invariant(
                $"a session could not be ended (the admin API returned {(int)response.StatusCode})"));
        }

        return true;
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        try
        {
            return await _httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw Failed("the connection failed", exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw Failed("the request timed out", exception);
        }
    }

    private async Task<JsonDocument> ReadJsonAsync(
        HttpResponseMessage response,
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
            throw Failed("the admin API's response was not valid JSON", exception);
        }
        catch (HttpRequestException exception)
        {
            throw Failed("the connection failed while reading the response", exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw Failed("the request timed out", exception);
        }
    }

    private SessionTerminationFailedException Failed(string reason, Exception? inner = null)
    {
        // Warning, not Error: the sign-in was refused cleanly and the employee is told so. Nothing
        // here is the unanticipated case the fallback handler exists for. No token — neither the
        // employee's nor the service account's — is named in the reason or anywhere else.
        _logger.LogWarning(
            "An employee's other sessions could not be ended, so sign-in was refused: {Reason}",
            reason);

        return inner is null
            ? new SessionTerminationFailedException(reason)
            : new SessionTerminationFailedException(reason, inner);
    }

    private string BuildTokenUrl() =>
        FormattableString.Invariant(
            $"{_options.Authority.TrimEnd('/')}/realms/{_options.Realm}/protocol/openid-connect/token");

    private string BuildAdminUrl(string path) =>
        FormattableString.Invariant(
            $"{_options.Authority.TrimEnd('/')}/admin/realms/{_options.Realm}/{path}");
}

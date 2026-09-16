using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Tarjay.Team.Infrastructure.UnitTests.Identity;

/// <summary>
/// Stands in for the network. Answers each request from a queued list of responses, and records
/// what was actually sent so a test can assert on the request rather than only the result.
/// </summary>
/// <remarks>
/// Hand-written rather than mocked with Moq because <see cref="HttpMessageHandler"/>'s
/// <c>SendAsync</c> is protected, which Moq can only reach awkwardly. This is the network boundary,
/// which is exactly where a stub belongs.
/// </remarks>
internal sealed class StubHttpMessageHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();

    /// <summary>Every request the handler was asked to send, in order.</summary>
    public List<RecordedRequest> Requests { get; } = [];

    /// <summary>Queues a JSON response with the given status code.</summary>
    public StubHttpMessageHandler RespondWith(HttpStatusCode statusCode, string json)
    {
        _responses.Enqueue(_ => new HttpResponseMessage(statusCode)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json"),
        });

        return this;
    }

    /// <summary>Queues a response with the given status code and no body.</summary>
    public StubHttpMessageHandler RespondWith(HttpStatusCode statusCode)
    {
        _responses.Enqueue(_ => new HttpResponseMessage(statusCode));

        return this;
    }

    /// <summary>Queues a thrown exception in place of a response.</summary>
    public StubHttpMessageHandler Throws(Exception exception)
    {
        _responses.Enqueue(_ => throw exception);

        return this;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        // Captured before the response is produced, because the request's content stream cannot be
        // read once the handler has been disposed along with the request.
        Requests.Add(new RecordedRequest(
            request.Method,
            request.RequestUri,
            request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken),
            request.Headers.Authorization?.Parameter));

        if (_responses.Count == 0)
        {
            throw new InvalidOperationException(
                $"The stub was sent an unexpected request to {request.RequestUri} — no response was queued for it.");
        }

        return _responses.Dequeue()(request);
    }

    /// <summary>What a single outbound request looked like.</summary>
    internal sealed record RecordedRequest(
        HttpMethod Method,
        Uri? RequestUri,
        string? Body,
        string? BearerToken);
}

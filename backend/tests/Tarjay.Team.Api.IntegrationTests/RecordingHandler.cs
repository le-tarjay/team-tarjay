using System;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Tarjay.Team.Api.IntegrationTests;

/// <summary>
/// Stands in for the network under a typed HTTP client: answers from a queue and records every
/// request.
/// </summary>
internal sealed class RecordingHandler : HttpMessageHandler
{
    private readonly ConcurrentQueue<Func<HttpResponseMessage>> _responses = new();

    public ConcurrentQueue<RecordedRequest> RequestLog { get; } = new();

    public RecordedRequest[] Requests => RequestLog.ToArray();

    public RecordingHandler Respond(HttpStatusCode status, string? json = null)
    {
        _responses.Enqueue(() => new HttpResponseMessage(status)
        {
            Content = json is null ? null : new StringContent(json, Encoding.UTF8, "application/json"),
        });

        return this;
    }

    public RecordingHandler Fail(Exception exception)
    {
        _responses.Enqueue(() => throw exception);

        return this;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        RequestLog.Enqueue(new RecordedRequest(
            request.RequestUri!,
            request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken)));

        if (!_responses.TryDequeue(out var respond))
        {
            throw new InvalidOperationException($"No response was queued for {request.RequestUri}.");
        }

        return respond();
    }
}

/// <summary>One request a <see cref="RecordingHandler"/> received.</summary>
internal sealed record RecordedRequest(Uri Uri, string? Body);

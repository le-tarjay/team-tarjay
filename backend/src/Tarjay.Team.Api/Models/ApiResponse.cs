using System.Text.Json.Serialization;

namespace Tarjay.Team.Api.Models;

/// <summary>
/// The envelope every successful response is wrapped in. A single-resource response gets the
/// envelope too, so a consumer has one shape to read rather than one shape per endpoint.
/// </summary>
/// <typeparam name="T">The resource, or list of resources, being returned.</typeparam>
/// <remarks>
/// Failures deliberately do not use this envelope — a <c>ProblemDetails</c> body stands alone at
/// the top level. A consumer branches on the status code to know which of the two shapes to expect.
/// </remarks>
public sealed class ApiResponse<T>
{
    /// <summary>The resource itself.</summary>
    [JsonPropertyName("data")]
    public required T Data { get; init; }

    /// <summary>Everything about the response that is not the resource itself.</summary>
    [JsonPropertyName("meta")]
    public ResponseMeta Meta { get; init; } = new();
}

/// <summary>
/// The non-resource half of a successful response: pagination for a list, and anything else later
/// found to belong alongside a resource without being part of it.
/// </summary>
/// <remarks>
/// Serializes to <c>{}</c> for a single resource, which is intended — the key is always present so
/// consumers never branch on its absence.
/// </remarks>
public sealed class ResponseMeta
{
    /// <summary>The page number returned, for a paginated list.</summary>
    [JsonPropertyName("page")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Page { get; init; }

    /// <summary>The page size requested, for a paginated list.</summary>
    [JsonPropertyName("pageSize")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? PageSize { get; init; }

    /// <summary>The total number of items across all pages, for a paginated list.</summary>
    [JsonPropertyName("totalCount")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? TotalCount { get; init; }
}

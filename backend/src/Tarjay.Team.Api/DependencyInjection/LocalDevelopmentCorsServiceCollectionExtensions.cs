using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Tarjay.Team.Api.DependencyInjection;

/// <summary>
/// Registers the cross-origin policy that lets a browser on the Angular dev server reach this API.
/// </summary>
/// <remarks>
/// <para>
/// There are two ways a browser reaches this API locally, and only one of them needs a policy at
/// all. The composed docker-compose stack serves the frontend and proxies <c>/v1/*</c> to the API
/// from one origin, so CORS never enters into it. The <c>ng serve</c> inner loop runs the frontend
/// outside the stack, on its own origin, against the composed API — that is the cross-origin case,
/// and it is the loop frontend work actually happens in.
/// </para>
/// <para>
/// Named for the concern rather than just "Cors" because ASP.NET Core ships its own
/// <c>CorsServiceCollectionExtensions</c> in <c>Microsoft.Extensions.DependencyInjection</c>, and
/// the short name is ambiguous wherever both namespaces are in scope.
/// </para>
/// </remarks>
internal static class LocalDevelopmentCorsServiceCollectionExtensions
{
    /// <summary>
    /// The name of the development-only policy, as applied in <c>Program.cs</c>.
    /// </summary>
    public const string LocalDevelopmentPolicyName = "LocalDevelopment";

    // The Angular dev server's origin, both spellings of the loopback host. A browser sends
    // whichever one the developer typed, and Origin matching is exact — "localhost" and
    // "127.0.0.1" are two different origins to CORS even though they are one machine.
    private static readonly string[] s_devServerOrigins =
    [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ];

    /// <summary>
    /// Registers a permissive policy for the Angular dev server's origin, in development only.
    /// </summary>
    /// <param name="services">The service collection to add to.</param>
    /// <param name="environment">The hosting environment, which decides whether to register at all.</param>
    /// <returns>The same service collection, for chaining.</returns>
    /// <remarks>
    /// Outside development this registers nothing, so there is no permissive policy in the
    /// container for a deployed environment to apply by accident. <c>Program.cs</c> guards the
    /// middleware on the same condition; both halves are scoped, not just one.
    /// </remarks>
    public static IServiceCollection AddLocalDevelopmentCors(
        this IServiceCollection services,
        IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(environment);

        if (!environment.IsDevelopment())
        {
            return services;
        }

        services.AddCors(options =>
        {
            options.AddPolicy(LocalDevelopmentPolicyName, policy =>
            {
                // Named origins rather than AllowAnyOrigin: this is a local convenience, and
                // naming the one origin that needs it keeps it from reading as a blanket opening.
                policy.WithOrigins(s_devServerOrigins);

                // The sign-in POST sends Content-Type: application/json, which is not a
                // safelisted value, so the browser preflights it and the header has to be allowed
                // or the real request is never sent.
                policy.AllowAnyHeader();

                policy.AllowAnyMethod();

                // Deliberately no AllowCredentials: sign-in posts JSON and reads the response
                // body, and nothing here rides on a cookie. Allowing credentials would widen the
                // policy past what the dev loop needs.
            });
        });

        return services;
    }
}

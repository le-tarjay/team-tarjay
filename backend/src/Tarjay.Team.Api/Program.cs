using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tarjay.Team.Api.DependencyInjection;

namespace Tarjay.Team.Api;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddContactStore();
        builder.Services.AddEmployeeIdentity(builder.Configuration);
        builder.Services.AddRequestValidation();
        builder.Services.AddApiExceptionHandling();
        builder.Services.AddLocalDevelopmentCors(builder.Environment);
        builder.Services.AddControllers();
        var app = builder.Build();

        // First in the pipeline, so nothing downstream can throw past it.
        app.UseExceptionHandler();

        // Downstream of the exception handler on purpose. The CORS middleware applies its headers
        // as the response starts rather than before calling the next middleware, so they land on
        // whatever response finally gets written — including the ProblemDetails the handler above
        // writes for a rejected credential or an unreachable authority. A browser that cannot read
        // those headers reports a CORS failure instead of the status, and the frontend's
        // 401-vs-503 distinction collapses back into one generic message.
        if (app.Environment.IsDevelopment())
        {
            app.UseCors(LocalDevelopmentCorsServiceCollectionExtensions.LocalDevelopmentPolicyName);
        }

        // Skipped in development, where the frontend and the API are both plain HTTP. A redirect
        // to https://localhost points at a certificate the browser does not trust, and it will not
        // follow it — so redirecting locally does not upgrade the request, it loses it.
        if (!app.Environment.IsDevelopment())
        {
            app.UseHttpsRedirection();
        }

        app.MapControllers();

        app.Run();
    }
}

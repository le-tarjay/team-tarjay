using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
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
        builder.Services.AddControllers();
        var app = builder.Build();

        // First in the pipeline, so nothing downstream can throw past it.
        app.UseExceptionHandler();

        app.UseHttpsRedirection();

        app.MapControllers();

        app.Run();
    }
}

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
        builder.Services.AddControllers();
        var app = builder.Build();

        app.UseHttpsRedirection();

        app.MapControllers();

        app.Run();
    }
}

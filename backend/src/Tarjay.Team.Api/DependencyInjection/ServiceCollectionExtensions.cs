using Microsoft.Extensions.DependencyInjection;
using Tarjay.Team.Contact;

namespace Tarjay.Team.Api.DependencyInjection;

internal static class ServiceCollectionExtensions
{
  public static IServiceCollection AddContactStore(this IServiceCollection services)
  {
    services.AddSingleton<IContactStore, InMemoryContactStore>();
    
    return services;
  }
}
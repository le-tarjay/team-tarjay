# The ASP.NET Core API, for the local docker-compose stack.
#
# This file lives in `infrastructure/` rather than `backend/` because runtime
# provisioning is this surface's job (see infrastructure/CONVENTIONS.md's
# Cross-surface impact). Its build context is `../../backend`, so every path below is
# relative to the backend surface root, not to this file.
#
# The .NET version is pinned to a 10.0 tag on purpose. `latest` has resolved to a
# major other than 10 in at least one environment, and the API targets net10.0
# (backend/Directory.Build.props), so a floating tag turns into a restore error that
# reads like a code problem.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Directory.Build.props carries TargetFramework, Nullable, and the analyzer settings
# for every project, so it has to land before any build.
COPY Directory.Build.props ./
COPY src/ src/

# Publishing the Api project pulls its ProjectReferences in transitively, which is what
# keeps this forward-compatible: when a new project appears under src/ and the API
# references it, it is picked up with no edit here. That is deliberately worth more than
# the extra layer caching a `dotnet restore` on an enumerated list of csproj files would
# buy for a local dev stack.
RUN dotnet publish src/Tarjay.Team.Api/Tarjay.Team.Api.csproj \
      --configuration Release \
      --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

# Plain HTTP only, and nothing here may set an HTTPS port. Program.cs calls
# UseHttpsRedirection() unconditionally; with no HTTPS port discoverable it logs a
# warning and passes the request through, which is what makes plain HTTP work. Set
# ASPNETCORE_HTTPS_PORTS and every proxied request starts answering 307 instead.
ENV ASPNETCORE_ENVIRONMENT=Development \
    ASPNETCORE_HTTP_PORTS=8080

EXPOSE 8080

# Non-root. APP_UID is provided by the .NET base image.
USER $APP_UID

ENTRYPOINT ["dotnet", "Tarjay.Team.Api.dll"]

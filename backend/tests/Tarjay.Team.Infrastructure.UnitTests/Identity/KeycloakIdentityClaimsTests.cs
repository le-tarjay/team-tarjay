using System;
using System.Text.Json;
using Tarjay.Team.Domain.Identity;
using Tarjay.Team.Infrastructure.Identity;

namespace Tarjay.Team.Infrastructure.UnitTests.Identity;

public class KeycloakIdentityClaimsTests
{
    private static readonly KeycloakOptions s_options = new();

    [Fact]
    public void ReadAuthority_WithAResolvedIdentity_ReturnsTierDepartmentAndJobFunction()
    {
        // Arrange
        using var claims = Parse("""
            {
              "sub": "d1b0a4f2-0000-0000-0000-000000000001",
              "preferred_username": "100482",
              "store_role": "department-manager",
              "department": "Grocery",
              "job_function": "Customer Support"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(EmployeeRole.DepartmentManager, authority.Role);
        Assert.Equal("Grocery", authority.Department);
        Assert.Equal("Customer Support", authority.JobFunction);
    }

    [Fact]
    public void ReadAuthority_OnAManagersClaimsAlone_ReturnsTierAndDepartmentWithoutSigningIn()
    {
        // Arrange — only the claims document, as the approval PIN check holds it after its own
        // credential check. No resolver, no HTTP client, no sign-in endpoint.
        using var claims = Parse("""
            {
              "sub": "d1b0a4f2-0000-0000-0000-000000000009",
              "preferred_username": "100900",
              "store_role": "store-manager",
              "department": "Store Operations",
              "job_function": "Store Management"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(EmployeeRole.StoreManager, authority.Role);
        Assert.Equal("Store Operations", authority.Department);
    }

    [Fact]
    public void ReadAuthority_WithoutADepartmentClaim_ReturnsAnEmptyDepartmentRatherThanThrowing()
    {
        // Arrange
        using var claims = Parse("""
            {
              "store_role": "department-manager",
              "job_function": "Customer Support"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(string.Empty, authority.Department);
        Assert.Equal(EmployeeRole.DepartmentManager, authority.Role);
        Assert.Equal("Customer Support", authority.JobFunction);
    }

    [Theory]
    [InlineData("\"\"")]
    [InlineData("\"   \"")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("42")]
    public void ReadAuthority_WithAnUnusableDepartmentClaim_ReturnsAnEmptyDepartment(string departmentJson)
    {
        // Arrange
        using var claims = Parse($$"""
            {
              "store_role": "associate",
              "department": {{departmentJson}},
              "job_function": "Register"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(string.Empty, authority.Department);
    }

    [Fact]
    public void ReadAuthority_WithoutAJobFunctionClaim_ReturnsAnEmptyJobFunction()
    {
        // Arrange
        using var claims = Parse("""
            {
              "store_role": "associate",
              "department": "Grocery"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(string.Empty, authority.JobFunction);
        Assert.Equal("Grocery", authority.Department);
    }

    [Theory]
    [InlineData("associate", EmployeeRole.Associate)]
    [InlineData("Associate", EmployeeRole.Associate)]
    [InlineData("department-manager", EmployeeRole.DepartmentManager)]
    [InlineData("department_manager", EmployeeRole.DepartmentManager)]
    [InlineData("DepartmentManager", EmployeeRole.DepartmentManager)]
    [InlineData("store-manager", EmployeeRole.StoreManager)]
    [InlineData("STORE_MANAGER", EmployeeRole.StoreManager)]
    [InlineData("receiving-associate", EmployeeRole.ReceivingAssociate)]
    public void ReadAuthority_WithRoleClaim_MapsToTheStoreRole(string roleClaim, EmployeeRole expected)
    {
        // Arrange
        using var claims = Parse($$"""
            {
              "store_role": "{{roleClaim}}",
              "department": "Grocery",
              "job_function": "Register"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(expected, authority.Role);
    }

    [Fact]
    public void ReadAuthority_WhenClaimsAreArrays_ReadsTheirValues()
    {
        // Arrange — Keycloak renders a multi-valued user attribute as an array even for one value.
        using var claims = Parse("""
            {
              "store_role": ["store-manager"],
              "department": ["Front End"],
              "job_function": ["Register"]
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, Unexpected);

        // Assert
        Assert.Equal(EmployeeRole.StoreManager, authority.Role);
        Assert.Equal("Front End", authority.Department);
        Assert.Equal("Register", authority.JobFunction);
    }

    [Fact]
    public void ReadAuthority_WithRenamedClaims_ReadsTheConfiguredNames()
    {
        // Arrange
        var options = new KeycloakOptions
        {
            RoleClaim = "tier",
            DepartmentClaim = "dept",
            JobFunctionClaim = "job",
        };

        using var claims = Parse("""
            {
              "tier": "associate",
              "dept": "Bakery",
              "job": "Baker"
            }
            """);

        // Act
        var authority = KeycloakIdentityClaims.ReadAuthority(claims.RootElement, options, Unexpected);

        // Assert
        Assert.Equal(EmployeeRole.Associate, authority.Role);
        Assert.Equal("Bakery", authority.Department);
        Assert.Equal("Baker", authority.JobFunction);
    }

    [Fact]
    public void ReadAuthority_WithoutARoleClaim_ThrowsWhatTheCallerBuildsAndNamesTheClaim()
    {
        // Arrange
        using var claims = Parse("""
            {
              "department": "Grocery",
              "job_function": "Register"
            }
            """);

        string? detail = null;

        // Act
        var failure = Assert.Throws<EmployeeIdentityIncompleteException>(
            () => KeycloakIdentityClaims.ReadAuthority(
                claims.RootElement,
                s_options,
                given =>
                {
                    detail = given;
                    return new EmployeeIdentityIncompleteException(given);
                }));

        // Assert
        Assert.NotNull(detail);
        Assert.Contains("store_role", detail, StringComparison.Ordinal);
        Assert.Contains("store_role", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ReadAuthority_WithARoleTheStoreDoesNotRecognize_ThrowsRatherThanDefaulting()
    {
        // Arrange
        using var claims = Parse("""
            {
              "store_role": "regional-director",
              "department": "Grocery",
              "job_function": "Register"
            }
            """);

        // Act / Assert — an unknown tier is refused, never quietly downgraded to Associate.
        var failure = Assert.Throws<EmployeeIdentityIncompleteException>(
            () => KeycloakIdentityClaims.ReadAuthority(
                claims.RootElement,
                s_options,
                detail => new EmployeeIdentityIncompleteException(detail)));

        Assert.Contains("regional-director", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ReadAuthority_WhenTheClaimsAreNotAnObject_ThrowsForTheMissingTier()
    {
        // Arrange
        using var claims = Parse("[]");

        // Act / Assert
        Assert.Throws<EmployeeIdentityIncompleteException>(
            () => KeycloakIdentityClaims.ReadAuthority(
                claims.RootElement,
                s_options,
                detail => new EmployeeIdentityIncompleteException(detail)));
    }

    [Fact]
    public void ReadAuthority_WithoutOptions_ThrowsArgumentNullException()
    {
        // Arrange
        using var claims = Parse("""{ "store_role": "associate" }""");

        // Act / Assert
        Assert.Throws<ArgumentNullException>(
            () => KeycloakIdentityClaims.ReadAuthority(claims.RootElement, null!, Unexpected));
    }

    [Fact]
    public void ReadAuthority_WithoutAFailureFactory_ThrowsArgumentNullException()
    {
        // Arrange
        using var claims = Parse("""{ "store_role": "associate" }""");

        // Act / Assert
        Assert.Throws<ArgumentNullException>(
            () => KeycloakIdentityClaims.ReadAuthority(claims.RootElement, s_options, null!));
    }

    [Fact]
    public void ReadClaim_WithAStringClaim_ReturnsItsValue()
    {
        // Arrange
        using var claims = Parse("""{ "name": "Avery Brooks" }""");

        // Act
        var value = KeycloakIdentityClaims.ReadClaim(claims.RootElement, "name");

        // Assert
        Assert.Equal("Avery Brooks", value);
    }

    [Fact]
    public void ReadClaim_WithAnAbsentClaim_ReturnsNull()
    {
        // Arrange
        using var claims = Parse("""{ "name": "Avery Brooks" }""");

        // Act
        var value = KeycloakIdentityClaims.ReadClaim(claims.RootElement, "sub");

        // Assert
        Assert.Null(value);
    }

    [Fact]
    public void ReadClaim_WithoutAClaimName_ThrowsArgumentNullException()
    {
        // Arrange
        using var claims = Parse("{}");

        // Act / Assert
        Assert.Throws<ArgumentNullException>(() => KeycloakIdentityClaims.ReadClaim(claims.RootElement, null!));
    }

    private static JsonDocument Parse(string json) => JsonDocument.Parse(json);

    private static Exception Unexpected(string detail) =>
        throw new InvalidOperationException($"The read reported an incomplete identity it should have accepted: {detail}");
}

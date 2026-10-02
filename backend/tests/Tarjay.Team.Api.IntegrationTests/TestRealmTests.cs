using Microsoft.IdentityModel.JsonWebTokens;
using Xunit;

namespace Tarjay.Team.Api.IntegrationTests;

/// <summary>
/// What <see cref="TestRealm"/>'s tokens actually carry.
/// </summary>
/// <remarks>
/// A fixture is not usually worth testing, but this one is a stand-in for the realm and the rest
/// of the suite reasons about identity through it. Its two identifying claims were a single
/// hardcoded string until this story, which is the specific way a fixture can lie: code reading
/// <c>sub</c> where it should read <c>preferred_username</c> passed every test, because the two
/// were equal. These assertions are what keep them apart.
/// </remarks>
public class TestRealmTests
{
    [Fact]
    public void ValidToken_ForAGivenEmployee_CarriesThatEmployeeIdApartFromTheSubject()
    {
        // Act
        var token = Decode(TestRealm.ValidToken(employeeId: "10042"));

        // Assert — the Employee ID is the username the realm knows the employee by; `sub` is the
        // realm's own GUID for them. A token where those two agree cannot tell a reader of one
        // from a reader of the other.
        Assert.Equal("10042", Claim(token, TestRealm.EmployeeIdClaim));
        Assert.NotEqual("10042", Claim(token, TestRealm.SubjectClaim));
        Assert.NotEqual(Claim(token, TestRealm.EmployeeIdClaim), Claim(token, TestRealm.SubjectClaim));
    }

    [Fact]
    public void ValidToken_ForTwoDifferentEmployees_CarriesADifferentEmployeeIdOnEach()
    {
        // Act — the two-employee case attendance and schedule tests need: one employee acting,
        // another whose records the action must leave alone.
        var acting = Decode(TestRealm.ValidToken(employeeId: "10042"));
        var other = Decode(TestRealm.ValidToken(employeeId: "10043"));

        // Assert
        Assert.Equal("10042", Claim(acting, TestRealm.EmployeeIdClaim));
        Assert.Equal("10043", Claim(other, TestRealm.EmployeeIdClaim));
        Assert.NotEqual(Claim(acting, TestRealm.EmployeeIdClaim), Claim(other, TestRealm.EmployeeIdClaim));

        // Two employees are two realm users, so the subjects differ too.
        Assert.NotEqual(Claim(acting, TestRealm.SubjectClaim), Claim(other, TestRealm.SubjectClaim));
    }

    [Fact]
    public void ValidToken_WithNoEmployeeIdAsked_CarriesTheIdItCarriedBefore()
    {
        // Act — what every existing caller gets, none of which passes the new parameter.
        var token = Decode(TestRealm.ValidToken());

        // Assert — this is the default those callers depend on; changing it moves the ground under
        // tests that never mention an employee at all.
        Assert.Equal(TestRealm.DefaultEmployeeId, Claim(token, TestRealm.EmployeeIdClaim));
        Assert.NotEqual(TestRealm.DefaultEmployeeId, Claim(token, TestRealm.SubjectClaim));
    }

    private static JsonWebToken Decode(string token) =>
        new JsonWebTokenHandler().ReadJsonWebToken(token);

    private static string? Claim(JsonWebToken token, string claimType) =>
        token.GetClaim(claimType).Value;
}

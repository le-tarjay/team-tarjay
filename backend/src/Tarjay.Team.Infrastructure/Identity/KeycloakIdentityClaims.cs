using System;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Tarjay.Team.Domain.Identity;

namespace Tarjay.Team.Infrastructure.Identity;

/// <summary>
/// Reads an employee's tier, department, and job function from the claims Keycloak returned for an
/// identity it has already resolved.
/// </summary>
/// <remarks>
/// This is the one place those claims are interpreted. Sign-in and the manager approval check both
/// read through it, so a manager's tier and department mean the same thing on both paths. It makes
/// no call to Keycloak and does not check that the identity exists. That is the caller's job.
/// </remarks>
public static class KeycloakIdentityClaims
{
    /// <summary>
    /// Reads the employee's tier, department, and job function from a resolved identity's claims.
    /// </summary>
    /// <param name="claims">The claims Keycloak returned for the identity, e.g. the userinfo body.</param>
    /// <param name="options">Names the claims that carry the tier, department, and job function.</param>
    /// <param name="incomplete">
    /// Builds the exception to throw when the tier is missing or unrecognized, given a detail that
    /// names the claim. The caller supplies it so the failure is logged with the caller's own
    /// context. The detail never contains a credential.
    /// </param>
    /// <returns>
    /// The employee's authority. A missing department or job function is returned as an empty
    /// string.
    /// </returns>
    /// <exception cref="Exception">
    /// Whatever <paramref name="incomplete"/> builds, when the tier claim is missing or names a tier
    /// the store does not recognize. A tier is never defaulted.
    /// </exception>
    public static EmployeeAuthority ReadAuthority(
        JsonElement claims,
        KeycloakOptions options,
        Func<string, Exception> incomplete)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(incomplete);

        var department = ReadClaim(claims, options.DepartmentClaim);
        var jobFunction = ReadClaim(claims, options.JobFunctionClaim);

        var roleClaim = ReadClaim(claims, options.RoleClaim);
        if (string.IsNullOrWhiteSpace(roleClaim))
        {
            throw incomplete(FormattableString.Invariant($"no {options.RoleClaim} claim was supplied"));
        }

        if (!TryParseRole(roleClaim, out var role))
        {
            // An unrecognized tier is not defaulted to Associate. Guessing downward would hand
            // someone the wrong authority quietly, which is worse than refusing.
            throw incomplete(
                FormattableString.Invariant($"the {options.RoleClaim} claim was \"{roleClaim}\", which is not one of the four roles the store recognizes"));
        }

        return new EmployeeAuthority
        {
            Role = role,
            Department = string.IsNullOrWhiteSpace(department) ? string.Empty : department,
            JobFunction = string.IsNullOrWhiteSpace(jobFunction) ? string.Empty : jobFunction,
        };
    }

    /// <summary>
    /// Reads one claim as a string, or returns <see langword="null"/> when it is absent or not a
    /// string.
    /// </summary>
    /// <param name="claims">The claims Keycloak returned for the identity.</param>
    /// <param name="claimName">The claim to read.</param>
    /// <returns>The claim's value, or <see langword="null"/>.</returns>
    public static string? ReadClaim(JsonElement claims, string claimName)
    {
        ArgumentNullException.ThrowIfNull(claimName);

        if (claims.ValueKind != JsonValueKind.Object
            || !claims.TryGetProperty(claimName, out var claim))
        {
            return null;
        }

        return claim.ValueKind switch
        {
            JsonValueKind.String => claim.GetString(),

            // Keycloak renders a multi-valued user attribute as an array even when a single value
            // is configured, so a one-element array is read as that value rather than refused.
            JsonValueKind.Array => claim.EnumerateArray()
                .Where(element => element.ValueKind == JsonValueKind.String)
                .Select(element => element.GetString())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)),

            _ => null,
        };
    }

    private static bool TryParseRole(string roleClaim, out EmployeeRole role)
    {
        // Compared with separators and casing stripped, so "department-manager",
        // "department_manager", and "DepartmentManager" all resolve to the same tier. The realm's
        // choice of spelling is not something this store should be brittle about.
        var normalized = new string(roleClaim.Where(char.IsLetterOrDigit).ToArray())
            .ToLower(CultureInfo.InvariantCulture);

        switch (normalized)
        {
            case "associate":
                role = EmployeeRole.Associate;
                return true;
            case "departmentmanager":
                role = EmployeeRole.DepartmentManager;
                return true;
            case "storemanager":
                role = EmployeeRole.StoreManager;
                return true;
            case "receivingassociate":
                role = EmployeeRole.ReceivingAssociate;
                return true;
            default:
                role = default;
                return false;
        }
    }
}

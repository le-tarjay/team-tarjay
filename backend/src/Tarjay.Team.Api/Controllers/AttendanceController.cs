using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Api.Models;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Api.Controllers;

/// <summary>
/// The calling employee's own attendance: their shift status, read from the store's records.
/// </summary>
/// <remarks>
/// Scoped under <c>me</c>, and deliberately so: the employee is always the one the bearer token
/// names, never one a route, body or query string names. Otherwise anyone could read, or later
/// change, anyone's shift. Its own controller rather than more surface on
/// <see cref="EmployeesController"/>, which is scoped to sign-in.
/// </remarks>
[ApiController]
[Authorize]
[Route("v1/employees/me")]
public sealed class AttendanceController(IAttendanceStore attendanceStore) : ControllerBase
{
    /// <summary>
    /// Reports the calling employee's current shift status: off shift, on shift, or on break.
    /// </summary>
    /// <returns>The shift status, wrapped in the standard success envelope.</returns>
    /// <remarks>
    /// Being signed in is not being on shift. An employee with no active clock-in record reads as
    /// off shift, including one who clocked in and out earlier the same day.
    /// </remarks>
    [HttpGet("shift")]
    [ProducesResponseType(typeof(ApiResponse<ShiftStatusResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<ApiResponse<ShiftStatusResponse>> GetShift()
    {
        string? employeeId = CallingEmployeeId();

        // A token the realm signed but that names no employee cannot be attributed to anyone, so
        // there is no shift to report. Challenged through the bearer scheme — the same bare 401
        // and WWW-Authenticate header as no token at all — rather than passed to the store and
        // failed as an unexpected error.
        if (employeeId is null)
        {
            return Challenge();
        }

        ShiftStatus status = attendanceStore.GetShiftStatus(employeeId);

        return Ok(new ApiResponse<ShiftStatusResponse> { Data = ShiftStatusResponse.From(status) });
    }

    // The Employee ID the bearer token was issued to. The JWT bearer registration names
    // `preferred_username` as the name claim, so this is that value — the Employee ID the realm's
    // users are — and not `sub`, which is the realm's own GUID and keys nothing here.
    private string? CallingEmployeeId()
    {
        string? name = User.Identity?.Name;

        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}

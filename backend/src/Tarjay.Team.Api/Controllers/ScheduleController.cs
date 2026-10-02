using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Api.Models;
using Tarjay.Team.Domain.Schedule;

namespace Tarjay.Team.Api.Controllers;

/// <summary>
/// The calling employee's own schedule: the shifts they are scheduled to work and their days off.
/// Read-only. There is no way to author or change a schedule through this API.
/// </summary>
/// <remarks>
/// <para>
/// Scoped under <c>me</c>, the same way the shift-status endpoint is. The employee is always the
/// one the bearer token names, never one a route, body or query string names.
/// </para>
/// <para>
/// Its own controller, and deliberately unwired from attendance. It depends on the schedule store
/// and nothing else. Being scheduled never feeds shift status, and shift status never changes
/// what the schedule says.
/// </para>
/// </remarks>
[ApiController]
[Authorize]
[Route("v1/employees/me")]
public sealed class ScheduleController(IScheduleStore scheduleStore) : ControllerBase
{
    /// <summary>
    /// Lists the calling employee's schedule around today, one entry per day and oldest first,
    /// each a shift with its time range or a day off.
    /// </summary>
    /// <returns>The scheduled days, wrapped in the standard success envelope.</returns>
    /// <remarks>
    /// The span is <see cref="ScheduleWindow"/>: from the start of any current calendar week
    /// through two weeks ahead. The list is short and fixed-length, so it is not paginated. An
    /// employee with no schedule gets an empty list, not an error.
    /// </remarks>
    [HttpGet("shifts")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ScheduledShiftResponse>>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<ApiResponse<IReadOnlyList<ScheduledShiftResponse>>> GetShifts()
    {
        string? employeeId = CallingEmployeeId();

        // A token the realm signed but that names no employee cannot be attributed to anyone, so
        // there is no schedule of theirs to read. It gets the bearer scheme's own challenge, the
        // same as the shift-status endpoint gives, rather than an empty schedule that looks like
        // an answer.
        if (employeeId is null)
        {
            return Challenge();
        }

        IReadOnlyList<ScheduledShiftResponse> shifts =
            [.. scheduleStore.GetShifts(employeeId).Select(ScheduledShiftResponse.From)];

        return Ok(new ApiResponse<IReadOnlyList<ScheduledShiftResponse>> { Data = shifts });
    }

    // The Employee ID the bearer token was issued to. The JWT bearer registration names
    // `preferred_username` as the name claim, so this is that value, never `sub`.
    private string? CallingEmployeeId()
    {
        string? name = User.Identity?.Name;

        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}

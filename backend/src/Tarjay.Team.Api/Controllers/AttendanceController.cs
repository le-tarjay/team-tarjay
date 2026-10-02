using System;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Tarjay.Team.Api.Models;
using Tarjay.Team.Domain.Attendance;

namespace Tarjay.Team.Api.Controllers;

/// <summary>
/// The calling employee's own attendance: their shift status, and the clock and break transitions
/// that change it.
/// </summary>
/// <remarks>
/// Scoped under <c>me</c>, and deliberately so: the employee is always the one the bearer token
/// names, never one a route, body or query string names. Otherwise anyone could read, or later
/// change, anyone's shift. Its own controller rather than more surface on
/// <see cref="EmployeesController"/>, which is scoped to sign-in.
/// <para>
/// Shift status and sign-in are separate state machines. Nothing here reads or changes the
/// employee's session: clocking out leaves them signed in, and the controller depends on nothing
/// but the attendance store, so it has no way to reach a session, a sale, or a schedule even by
/// mistake.
/// </para>
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

    /// <summary>Clocks the calling employee in: off shift to on shift.</summary>
    /// <returns>The resulting shift status, wrapped in the standard success envelope.</returns>
    /// <remarks>Rejected with 409 if the employee is already on shift or on break.</remarks>
    [HttpPost("clock-in")]
    [ProducesResponseType(typeof(ApiResponse<ShiftStatusResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<ApiResponse<ShiftStatusResponse>> ClockIn() => Transition(attendanceStore.ClockIn);

    /// <summary>Clocks the calling employee out: on shift or on break to off shift.</summary>
    /// <returns>The resulting shift status, wrapped in the standard success envelope.</returns>
    /// <remarks>
    /// Rejected with 409 if the employee is already off shift. Does not sign the employee out. Does
    /// not check for an open register — that block belongs to clock-out register accountability,
    /// not here.
    /// </remarks>
    [HttpPost("clock-out")]
    [ProducesResponseType(typeof(ApiResponse<ShiftStatusResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<ApiResponse<ShiftStatusResponse>> ClockOut() => Transition(attendanceStore.ClockOut);

    /// <summary>Starts a break for the calling employee: on shift to on break.</summary>
    /// <returns>The resulting shift status, wrapped in the standard success envelope.</returns>
    /// <remarks>Rejected with 409 if the employee is off shift or already on break.</remarks>
    [HttpPost("start-break")]
    [ProducesResponseType(typeof(ApiResponse<ShiftStatusResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<ApiResponse<ShiftStatusResponse>> StartBreak() => Transition(attendanceStore.StartBreak);

    /// <summary>Ends the calling employee's break: on break straight back to on shift.</summary>
    /// <returns>The resulting shift status, wrapped in the standard success envelope.</returns>
    /// <remarks>Rejected with 409 if the employee is not on break.</remarks>
    [HttpPost("end-break")]
    [ProducesResponseType(typeof(ApiResponse<ShiftStatusResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public ActionResult<ApiResponse<ShiftStatusResponse>> EndBreak() => Transition(attendanceStore.EndBreak);

    // The one shape all four transitions share: attribute the caller, apply the transition to them
    // and only them, and report the status the store now holds — so a client takes its state from
    // the server's answer rather than assuming it. A rejected transition throws, and the attendance
    // exception handler answers 409.
    private ActionResult<ApiResponse<ShiftStatusResponse>> Transition(Func<string, ShiftStatus> transition)
    {
        string? employeeId = CallingEmployeeId();

        // The same challenge GetShift gives a token that names no employee: there is nobody to
        // apply the transition to.
        if (employeeId is null)
        {
            return Challenge();
        }

        ShiftStatus status = transition(employeeId);

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

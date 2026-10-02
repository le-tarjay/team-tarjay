import { shiftActionsFor } from './shift-actions';

describe('shiftActionsFor', () => {
  function labels(status: Parameters<typeof shiftActionsFor>[0]): string[] {
    return shiftActionsFor(status).map((action) => action.label);
  }

  it('offers exactly "Clock in" off shift, as the primary action', () => {
    expect(labels('OffShift')).toEqual(['Clock in']);
    expect(shiftActionsFor('OffShift')[0]?.primary).toBe(true);
  });

  it('offers exactly "Start break" then "Clock out" on shift, neither primary', () => {
    expect(labels('OnShift')).toEqual(['Start break', 'Clock out']);
    expect(shiftActionsFor('OnShift').some((action) => action.primary)).toBe(false);
  });

  it('offers exactly "End break" then "Clock out" on break, with End break primary', () => {
    const actions = shiftActionsFor('OnBreak');

    expect(labels('OnBreak')).toEqual(['End break', 'Clock out']);
    expect(actions.map((action) => action.primary)).toEqual([true, false]);
  });

  it('offers nothing before the server has reported a status', () => {
    expect(shiftActionsFor(null)).toEqual([]);
  });

  it('sends Clock in and End break to the default on-shift screen', () => {
    expect(shiftActionsFor('OffShift')[0]?.landsOn).toBe('/sale');
    expect(shiftActionsFor('OnBreak')[0]?.landsOn).toBe('/sale');
  });

  it('sends Start break and Clock out to Home', () => {
    expect(shiftActionsFor('OnShift').map((action) => action.landsOn)).toEqual(['/home', '/home']);
    expect(shiftActionsFor('OnBreak')[1]?.landsOn).toBe('/home');
  });
});

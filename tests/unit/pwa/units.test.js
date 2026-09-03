// Display units (CDC §2.9).
//
// Two properties matter more than the arithmetic:
//
//   1. Metric must be byte-identical to what the templates computed
//      before this existed. It is the default and the overwhelming
//      majority case; a regression there would be a real one.
//   2. Only lengths convert. The field definitions also carry '°', 's',
//      'mm' and 'day', and an "imperial" slope angle is nonsense.
//
// Nothing here touches what is sent to the API: Camptocamp stores metres,
// and a topo edited by someone reading feet is still published in metres.

import { describe, expect, it } from 'vitest';

import { displayValueAndUnit, distance, elevation, IMPERIAL, METRIC } from '@/pwa/units';

describe('metric is exactly what the templates used to print', () => {
  it('returns a plain value untouched', () => {
    expect(displayValueAndUnit(1200, 'm', null, METRIC)).toEqual({ value: 1200, unit: 'm' });
  });

  it('keeps V1 divisor rounding to whole kilometres', () => {
    // RouteView renders a metre-stored length as km via divisor 1000, and
    // rounds. That rounding is existing behaviour, not something to fix.
    expect(displayValueAndUnit(14600, 'km', 1000, METRIC)).toEqual({ value: 15, unit: 'km' });
  });

  it('is the behaviour when no preference has been set', () => {
    expect(displayValueAndUnit(1200, 'm', null, undefined)).toEqual({ value: 1200, unit: 'm' });
  });
});

describe('imperial converts lengths only', () => {
  it('turns metres into feet', () => {
    expect(displayValueAndUnit(1000, 'm', null, IMPERIAL)).toEqual({ value: 3281, unit: 'ft' });
  });

  it('converts from the unrounded distance, not from whole kilometres', () => {
    // 14600 m is 9.07 mi. Rounding to 15 km first and converting would
    // give 9.3 — a fifth of a mile invented by the order of operations.
    expect(displayValueAndUnit(14600, 'km', 1000, IMPERIAL)).toEqual({ value: 9.1, unit: 'mi' });
  });

  it('leaves a slope angle alone', () => {
    expect(displayValueAndUnit(35, '°', null, IMPERIAL)).toEqual({ value: 35, unit: '°' });
  });

  it('leaves durations and rainfall alone', () => {
    expect(displayValueAndUnit(3, 'day', null, IMPERIAL)).toEqual({ value: 3, unit: 'day' });
    expect(displayValueAndUnit(40, 'mm', null, IMPERIAL)).toEqual({ value: 40, unit: 'mm' });
  });

  it('leaves a value it cannot convert alone', () => {
    // Some fields are text or null; converting would print NaN where the
    // page used to show nothing of concern.
    expect(displayValueAndUnit(null, 'm', null, IMPERIAL)).toEqual({ value: null, unit: 'm' });
    expect(displayValueAndUnit('n/a', 'm', null, IMPERIAL)).toEqual({ value: 'n/a', unit: 'm' });
  });
});

describe('the figures shown while walking', () => {
  it('shows a distance to one decimal in both systems', () => {
    // 12 km and 12.4 km are a different afternoon.
    expect(distance(12400, METRIC)).toEqual({ value: 12.4, unit: 'km' });
    expect(distance(12400, IMPERIAL)).toEqual({ value: 7.7, unit: 'mi' });
  });

  it('shows elevation as a whole number in both systems', () => {
    expect(elevation(1234.6, METRIC)).toEqual({ value: 1235, unit: 'm' });
    expect(elevation(1000, IMPERIAL)).toEqual({ value: 3281, unit: 'ft' });
  });

  it('reads zero rather than NaN before the first fix', () => {
    // The pill renders from the very start of an outing, when the session
    // has no trace yet.
    expect(distance(undefined, METRIC)).toEqual({ value: 0, unit: 'km' });
    expect(elevation(NaN, IMPERIAL)).toEqual({ value: 0, unit: 'ft' });
  });
});

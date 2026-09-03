// Distance and elevation units (CDC §2.9: "la configuration des unités :
// kilomètres, miles, mètres, pieds").
//
// Camptocamp stores everything in metres. Only the display converts, so
// nothing that is sent to the API ever passes through here — a topo
// edited by someone reading feet must still be published in metres.
//
// The metric path is deliberately untouched by this module: it returns
// exactly what the templates used to compute themselves. Imperial is the
// only new behaviour, so the default rendering cannot regress.

export const METRIC = 'metric';
export const IMPERIAL = 'imperial';

const FEET_PER_METRE = 3.28084;
const MILES_PER_KM = 0.621371;

// Only lengths convert. The field definitions also carry '°' (slope),
// 's', 'mm' and 'day', and turning a slope angle or a duration into
// anything "imperial" would be nonsense.
const CONVERTIBLE = new Set(['m', 'km']);

export function isImperial(system) {
  return system === IMPERIAL;
}

// The value and unit to print for a numeric field.
//
// `divisor` is V1's way of showing a metre-stored field in kilometres
// (RouteView passes divisor 1000 with unit "km"); metric keeps that
// exact rounding. Imperial converts from the unrounded quantity instead,
// because rounding to whole kilometres first and then to miles loses a
// noticeable amount on a short route.
export function displayValueAndUnit(value, unit, divisor, system) {
  const metric = { value: divisor ? Math.round(value / divisor) : value, unit };

  if (!isImperial(system) || typeof value !== 'number' || !Number.isFinite(value) || !CONVERTIBLE.has(unit)) {
    return metric;
  }

  if (unit === 'km') {
    const km = divisor ? value / divisor : value;
    return { value: round(km * MILES_PER_KM, 1), unit: 'mi' };
  }

  // 'm' fields are stored and displayed in metres, never divided.
  return { value: Math.round(value * FEET_PER_METRE), unit: 'ft' };
}

// Metres → the elevation figure to show, as a whole number either way.
// Used by the V3 surfaces, which hold raw metres rather than a field.
export function elevation(metres, system) {
  if (typeof metres !== 'number' || !Number.isFinite(metres)) {
    return { value: 0, unit: isImperial(system) ? 'ft' : 'm' };
  }
  return isImperial(system)
    ? { value: Math.round(metres * FEET_PER_METRE), unit: 'ft' }
    : { value: Math.round(metres), unit: 'm' };
}

// Metres → the distance figure to show, to one decimal. One decimal is
// what a walked distance deserves: 12 km and 12.4 km are a different
// afternoon, and whole kilometres hide that.
export function distance(metres, system) {
  if (typeof metres !== 'number' || !Number.isFinite(metres)) {
    return { value: 0, unit: isImperial(system) ? 'mi' : 'km' };
  }
  const km = metres / 1000;
  return isImperial(system) ? { value: round(km * MILES_PER_KM, 1), unit: 'mi' } : { value: round(km, 1), unit: 'km' };
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Great-circle distance (Haversine) — accurate enough for outdoor
// distances and cheap enough for a per-tick jitter filter. Consumed
// by outing-session.js (trace distance + jitter guard) and stands
// alone here so it's trivially unit-testable without dragging Vue in.
//
// Inputs are `{ lat, lon }` in WGS84 degrees. Returns meters.

const EARTH_RADIUS_M = 6371000;

export function haversine(a, b) {
  if (!a || !b) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

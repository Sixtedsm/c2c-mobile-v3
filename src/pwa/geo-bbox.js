// Pure geometry helpers shared by NearMeButton (bbox from a single
// point + radius) and outing-session (bbox from a full trace). Kept
// separate from Vue components so both callers can import identical
// logic — and so unit tests don't need to boot OpenLayers.
//
// Callers must pass the OpenLayers `ol` instance rather than let this
// module import it directly. That keeps the module import-graph flat
// (helpful when Vitest resolves the file) and mirrors how offline.js
// and the components already inject their dependencies.

// Compute a bbox in EPSG:3857 around a WGS84 point, sized so the real-
// world radius stays honest at high latitudes. Web Mercator stretches
// away from the equator by 1/cos(lat), so a naive N-meter buffer
// under-shoots the requested radius in the Alps by ~30%. The cos
// division restores the intended footprint.
export function bboxFromLonLatRadius(ol, longitude, latitude, radiusKm) {
  const center = ol.proj.fromLonLat([longitude, latitude]);
  const latRad = (latitude * Math.PI) / 180;
  const bufferMeters = (radiusKm * 1000) / Math.max(Math.cos(latRad), 0.1);
  return ol.extent.buffer([center[0], center[1], center[0], center[1]], bufferMeters).map(Math.floor).join(',');
}

// Compute a bbox in EPSG:3857 around a recorded trace (array of WGS84
// positions), padded by `padMeters` real-world meters so the API
// returns routes just off the recorded line. Latitude-corrected the
// same way as bboxFromLonLatRadius.
export function bboxFromPositions(ol, positions, padMeters = 500) {
  if (!positions || !positions.length) return null;
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;
  let latSum = 0;
  for (const p of positions) {
    const [x, y] = ol.proj.fromLonLat([p.lon, p.lat]);
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
    latSum += p.lat;
  }
  if (!Number.isFinite(xMin)) return null;
  const meanLat = latSum / positions.length;
  const pad = padMeters / Math.max(Math.cos((meanLat * Math.PI) / 180), 0.1);
  return [xMin - pad, yMin - pad, xMax + pad, yMax + pad].map(Math.floor).join(',');
}

// Pure geometry helper for NearMeButton (bbox from a single point +
// radius). Kept separate from Vue components so unit tests don't need
// to boot OpenLayers.
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

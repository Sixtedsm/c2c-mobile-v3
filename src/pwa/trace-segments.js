// Where a recorded trace is broken.
//
// A point flagged `gap` is the first one recorded after the GPS stopped
// and started again — an explicit pause, or the tracking checkbox turned
// off to save battery. The step leading to it was not walked with the
// app watching, so nothing may treat it as continuous: not the published
// distance and elevation, not the GPX handed to the user, not the trace
// drawn on camptocamp.org.
//
// Those three all need the same answer, so the split lives here once
// rather than being re-derived — differently — in each of them.
export function splitOnGaps(positions) {
  const segments = [];
  for (const point of positions ?? []) {
    if (!segments.length || point.gap) {
      segments.push([]);
    }
    segments[segments.length - 1].push(point);
  }
  return segments;
}

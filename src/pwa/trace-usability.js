// Is a recorded trace worth publishing as the outing's own figures?
//
// Feedback Gilles (mail 2026-09-04): a real outing of 30 km and +1900 m
// was published as 0,015 km and +12 m. The GPS had run for a few seconds
// standing still, and those few metres of noise went straight into the
// form. Worse, once written they *blocked* the itinéraire's own figures —
// V1 only propagates a route's properties into fields that are still
// empty (see propagateRoutePropertiesToOutingProperties). A pinch of
// noise therefore beat a real topo.
//
// So the question the form has to ask is not "are there points?" but
// "does this trace describe the outing?". Three ways it can fail:
//
//   too-few-points  a handful of fixes is a position, not a walk
//   too-short       a distance below the floor is jitter, not a route
//   partial         the recording covers a small part of the outing, so
//                   its distance is not the outing's distance
//
// Below any of those the figures are left alone, the itinéraire's own
// values propagate as they do on camptocamp.org, and the form says why.

import { splitOnGaps } from '@/pwa/trace-segments';

export const MIN_POINTS = 10;
export const MIN_DISTANCE_M = 200;
// Under half the outing recorded, "longueur totale" would be a lie by
// construction — whatever the trace itself is worth.
export const MIN_COVERAGE = 0.5;

export function summariseTrace(positions, { distanceMeters = 0, elapsedMs = 0 } = {}) {
  const points = (positions ?? []).length;

  // Sum the spans of the recorded segments, not the wall clock: the
  // breaks between them are exactly the stretches nothing was watching.
  const recordedMs = splitOnGaps(positions).reduce((total, segment) => {
    if (segment.length < 2) return total;
    const span = (segment[segment.length - 1].t ?? 0) - (segment[0].t ?? 0);
    return total + Math.max(0, span);
  }, 0);

  // No usable elapsed time to compare against (a session restored without
  // a start time): assume the trace covers the outing rather than invent
  // a doubt we cannot substantiate.
  const coverage = elapsedMs > 0 ? Math.min(1, recordedMs / elapsedMs) : 1;

  let reason = null;
  if (points < MIN_POINTS) reason = 'too-few-points';
  else if (distanceMeters < MIN_DISTANCE_M) reason = 'too-short';
  else if (coverage < MIN_COVERAGE) reason = 'partial';

  return { points, recordedMs, coverage, usable: reason === null, reason };
}

// Distance and elevation from a recorded GPS trace.
//
// Summing every step of a raw trace does not measure an outing, it
// measures GPS noise. A consumer receiver scatters each fix by a few
// metres horizontally and about twice that vertically, and a naive sum
// accumulates those errors instead of cancelling them. Simulated against
// a 3 h climb of 4.8 km and 800 m, the old code reported 19.5 km and
// 11 653 m; half an hour with the phone sitting on a rock produced 3.2 km
// and 2 063 m out of nothing.
//
// These figures are published to camptocamp.org as length_total,
// height_diff_up and height_diff_down. This is a data-quality problem
// before it is a display one.
//
// Three defences, which is what field-proven trackers do:
//
//   1. Smooth before measuring. A trailing mean over SMOOTHING_WINDOW
//      fixes divides independent noise by roughly its square root, and
//      that single step does most of the work.
//   2. Ignore horizontal steps below a noise floor, so standing still
//      accumulates nothing.
//   3. Accumulate elevation with hysteresis against a moving reference
//      rather than summing every wobble.
//
// Calibrated against two noise models — independent per fix, and a
// correlated random walk, which is closer to how a receiver actually
// drifts. Tuning on the first alone would over-filter the second, and
// erasing a real slow approach is the failure that would matter most.
// The chosen values keep a 2 km/h approach intact (0.66 km measured for
// 0.66 km walked) while reducing a stationary half-hour to zero.
//
// The trade-off is deliberate: genuine movement below the floors is lost.
// Under-reporting a few metres is a far smaller error than inventing
// kilometres, and it is the trade every serious tracker makes.

import { haversine } from '@/pwa/haversine';

// Beyond this the receiver is telling us it does not know where it is: a
// 100 m "fix" is a cell-tower guess. Generous on purpose — a couloir or
// dense forest legitimately degrades accuracy, and rejecting those would
// leave a hole in the trace.
export const MAX_ACCURACY_M = 50;

// Trailing mean applied before anything is measured.
const SMOOTHING_WINDOW = 9;

// Horizontal noise floor, applied to smoothed positions.
const MIN_STEP_M = 10;

// Vertical hysteresis. Vertical error is the worse of the two.
const ELEVATION_THRESHOLD_M = 10;

// Is this fix worth recording at all? Asked while sampling, so a garbage
// position never enters the trace — it would spike the map as well as
// the totals.
export function isUsableFix(accuracy) {
  // A receiver reporting no accuracy is trusted: some browsers omit it,
  // and refusing everything would record nothing at all.
  if (accuracy === null || accuracy === undefined) return true;
  return accuracy <= MAX_ACCURACY_M;
}

function hasAltitude(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Distance, gain and loss in one pass.
//
// One pass rather than three: they share the segment and smoothing logic,
// and computing them separately let them disagree about where a break
// was — as well as costing three walks of a trace that can hold thousands
// of points and is recomputed on every fix.
//
// A point flagged `gap` opens a new segment: the step leading to it was
// not walked with the app watching (a pause, or tracking switched off),
// and the smoothing window must not straddle it either.
export function computeTraceMetrics(positions) {
  const points = Array.isArray(positions) ? positions : [];
  let distance = 0;
  let gain = 0;
  let loss = 0;

  // Rolling window state. Sums rather than a slice per point, so the
  // whole thing stays linear in the number of fixes.
  let window = [];
  let sumLat = 0;
  let sumLon = 0;
  let sumAlt = 0;
  let countAlt = 0;

  let previous = null; // last smoothed point that counted for distance
  let reference = null; // altitude the hysteresis measures against

  const resetSegment = () => {
    window = [];
    sumLat = 0;
    sumLon = 0;
    sumAlt = 0;
    countAlt = 0;
    previous = null;
    reference = null;
  };

  for (const point of points) {
    if (!point) continue;
    if (point.gap) resetSegment();

    window.push(point);
    sumLat += point.lat;
    sumLon += point.lon;
    if (hasAltitude(point.alt)) {
      sumAlt += point.alt;
      countAlt += 1;
    }

    if (window.length > SMOOTHING_WINDOW) {
      const dropped = window.shift();
      sumLat -= dropped.lat;
      sumLon -= dropped.lon;
      if (hasAltitude(dropped.alt)) {
        sumAlt -= dropped.alt;
        countAlt -= 1;
      }
    }

    const smoothed = {
      lat: sumLat / window.length,
      lon: sumLon / window.length,
      // Averaged over the fixes that actually carried an altitude. A
      // dropout is skipped, never read as zero — `alt || 0` turned every
      // one of them into a 2 000 m descent followed by a 2 000 m climb.
      alt: countAlt > 0 ? sumAlt / countAlt : null,
    };

    if (previous) {
      const step = haversine(previous, smoothed);
      if (step >= MIN_STEP_M) {
        distance += step;
        previous = smoothed;
      }
    } else {
      previous = smoothed;
    }

    if (hasAltitude(smoothed.alt)) {
      if (reference === null) {
        reference = smoothed.alt;
      } else {
        const change = smoothed.alt - reference;
        if (change >= ELEVATION_THRESHOLD_M) {
          gain += change;
          reference = smoothed.alt;
        } else if (change <= -ELEVATION_THRESHOLD_M) {
          loss += -change;
          reference = smoothed.alt;
        }
        // Smaller changes leave the reference alone on purpose, so a slow
        // real climb still accumulates once it clears the threshold
        // instead of being lost a centimetre at a time.
      }
    }
  }

  return { distance, gain, loss };
}

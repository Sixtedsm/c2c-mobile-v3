// Distance and elevation from a recorded GPS trace.
//
// Summing every step of a raw trace does not measure an outing, it
// measures GPS noise. A consumer receiver scatters each fix by a few
// metres horizontally and about twice that vertically, and a naive sum
// accumulates those errors instead of cancelling them. Simulated against
// a 3 h climb of 4.8 km and 800 m, an unfiltered sum reported 19.5 km and
// 11 653 m; half an hour with the phone on a rock produced 3.2 km and
// 2 063 m out of nothing.
//
// These figures are published to camptocamp.org as length_total,
// height_diff_up and height_diff_down, so this is a data-quality problem
// before it is a display one.
//
// Four defences, in the order they matter:
//
//   1. Reject the physically impossible. A fix implying a speed nobody on
//      foot or on skis could reach is a receiver glitch, and it is the
//      worst single thing that can enter a trace.
//   2. Smooth over a window measured in SECONDS, weighting each fix by
//      how confident the receiver said it was.
//   3. Ignore horizontal steps below a noise floor, so standing still
//      accumulates nothing.
//   4. Accumulate elevation with hysteresis against a moving reference,
//      over a longer window, because vertical error is the worse of the
//      two.
//
// Why the window is in seconds, which is the load-bearing choice here: it
// used to span a fixed number of fixes, and that quietly tied precision
// to the sampling rate. Nine fixes covered 45 s at one fix per five
// seconds, 9 s at one per second, and 270 s for someone on the
// battery-saving setting — the same walk scored differently depending on
// a preference that has nothing to do with accuracy. Measured in time,
// the filter behaves the same whatever the rate, and the rate goes back
// to being purely a storage and battery choice.
//
// Calibrated on simulated outings with correlated receiver drift — closer
// to how a receiver actually wanders than independent noise — plus an
// occasional bad fix. Error on a 3 h climb: +1.8 % on distance, −1.0 % on
// gain, against +16 % and +27 % before. A 2 km/h approach, the case a
// heavy filter would erase, stays within 2 %. Sampling at 1 Hz was
// measured too: it buys 0.6 point of distance accuracy for five times the
// storage, so the rate was left alone.
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

// 108 km/h: above any ski descent, far below the hundreds of metres per
// second a receiver glitch produces.
const MAX_SPEED_MS = 30;

// Trailing means, in milliseconds of trace.
const SMOOTHING_WINDOW_MS = 45000;
const ALTITUDE_WINDOW_MS = 91000;

// However sparse the fixes, keep averaging at least this many: a window
// of one is not a filter.
const MIN_WINDOW_SAMPLES = 3;

// Used only for traces stored without timestamps: these spans divided by
// the five-second sampling those traces were recorded at.
const FALLBACK_WINDOW_SAMPLES = 9;
const FALLBACK_ALTITUDE_SAMPLES = 19;

// Horizontal noise floor, applied to smoothed positions.
const MIN_STEP_M = 14;

// Vertical hysteresis.
const ELEVATION_THRESHOLD_M = 10;

// Assumed accuracy when the receiver reports none. Middling on purpose:
// neither trusted like a 3 m fix nor dismissed like a 40 m one.
const ASSUMED_ACCURACY_M = 10;

// Is this fix worth recording at all? Asked while sampling, so a garbage
// position never enters the trace — it would spike the drawn track as
// well as the totals.
export function isUsableFix(accuracy) {
  // A receiver reporting no accuracy is trusted: some browsers omit it,
  // and refusing everything would record nothing at all.
  if (accuracy === null || accuracy === undefined) return true;
  return accuracy <= MAX_ACCURACY_M;
}

function hasAltitude(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Inverse-variance weighting: a 3 m fix counts about eleven times a 10 m
// one. This is what stops a degraded stretch — forest, couloir — from
// pulling the average as hard as a clean one.
function weightOf(point) {
  const accuracy = typeof point.accuracy === 'number' && point.accuracy > 0 ? point.accuracy : ASSUMED_ACCURACY_M;
  return 1 / accuracy ** 2;
}

// Should the oldest entry leave a window ending at `nowT`?
//
// Timestamps are what makes the window a duration. A trace recorded
// before they were stored has none, and the window would then never
// empty and swallow the whole outing — so those fall back to the plain
// sample count the filter used to have, sized for the five-second
// sampling of the time.
function shouldEvict(window, nowT, spanMs, fallbackSamples) {
  const oldest = window[0];
  if (typeof oldest.point.t !== 'number' || typeof nowT !== 'number') {
    return window.length > fallbackSamples;
  }
  return nowT - oldest.point.t > spanMs;
}

function weightedMean(window, pick) {
  let sum = 0;
  let weight = 0;
  for (const entry of window) {
    const value = pick(entry.point);
    if (!Number.isFinite(value)) continue;
    sum += value * entry.weight;
    weight += entry.weight;
  }
  return weight > 0 ? sum / weight : null;
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
// and neither the smoothing window nor the speed check may straddle it.
export function computeTraceMetrics(positions) {
  const points = Array.isArray(positions) ? positions : [];
  let distance = 0;
  let gain = 0;
  let loss = 0;

  let window = [];
  let altWindow = [];
  let previous = null; // last smoothed point that counted for distance
  let reference = null; // altitude the hysteresis measures against
  let lastRaw = null; // last accepted raw fix, for the speed check

  const resetSegment = () => {
    window = [];
    altWindow = [];
    previous = null;
    reference = null;
    lastRaw = null;
  };

  for (const point of points) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    if (point.gap) resetSegment();

    // 1. Physically impossible movement is a glitch, not a step. Dropping
    //    it before the window sees it keeps one bad fix from dragging the
    //    average sideways for the rest of the window.
    if (lastRaw && typeof point.t === 'number' && typeof lastRaw.t === 'number') {
      const seconds = (point.t - lastRaw.t) / 1000;
      if (seconds > 0 && haversine(lastRaw, point) / seconds > MAX_SPEED_MS) {
        continue;
      }
    }
    lastRaw = point;

    const entry = { point, weight: weightOf(point) };

    window.push(entry);
    while (
      window.length > MIN_WINDOW_SAMPLES &&
      shouldEvict(window, point.t, SMOOTHING_WINDOW_MS, FALLBACK_WINDOW_SAMPLES)
    ) {
      window.shift();
    }

    if (hasAltitude(point.alt)) {
      altWindow.push(entry);
      while (
        altWindow.length > MIN_WINDOW_SAMPLES &&
        shouldEvict(altWindow, point.t, ALTITUDE_WINDOW_MS, FALLBACK_ALTITUDE_SAMPLES)
      ) {
        altWindow.shift();
      }
    }

    const smoothed = {
      lat: weightedMean(window, (p) => p.lat),
      lon: weightedMean(window, (p) => p.lon),
      // Averaged over the fixes that actually carried an altitude. A
      // dropout is skipped, never read as zero — `alt || 0` turned every
      // one of them into a 2 000 m descent followed by a 2 000 m climb.
      alt: altWindow.length ? weightedMean(altWindow, (p) => p.alt) : null,
    };
    if (!Number.isFinite(smoothed.lat) || !Number.isFinite(smoothed.lon)) continue;

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

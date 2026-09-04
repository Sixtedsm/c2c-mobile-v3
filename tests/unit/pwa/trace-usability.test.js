// The guard between a GPS recording and the figures published on
// camptocamp.org.
//
// Gilles' outing of 2026-09-04 is the reference case: 30 km and +1900 m
// walked, 15 m and +12 m published, because the recorder had run for a
// few seconds standing still and the form took whatever it found. The
// second harm was invisible — those 12 m occupied the dénivelé field, so
// the itinéraire's own +1900 m had nothing left to propagate into.

import { describe, expect, it } from 'vitest';

import { MIN_COVERAGE, MIN_DISTANCE_M, MIN_POINTS, summariseTrace } from '@/pwa/trace-usability';

// A trace of `n` points, one every 5 s, starting at t0.
const trace = (n, t0 = 0, step = 5000) =>
  Array.from({ length: n }, (_, i) => ({ lat: 45 + i * 1e-4, lon: 6, t: t0 + i * step }));

const HOUR = 3600 * 1000;

describe('summariseTrace', () => {
  it('accepts a recording that covers the outing', () => {
    // 720 points over an hour, 5 km walked, session lasted that hour.
    const summary = summariseTrace(trace(720), { distanceMeters: 5000, elapsedMs: HOUR });
    expect(summary.usable).toBe(true);
    expect(summary.reason).toBe(null);
    expect(summary.points).toBe(720);
    expect(summary.coverage).toBeCloseTo(1, 2);
  });

  it('rejects a handful of fixes', () => {
    const summary = summariseTrace(trace(MIN_POINTS - 1), { distanceMeters: 5000, elapsedMs: HOUR });
    expect(summary.usable).toBe(false);
    expect(summary.reason).toBe('too-few-points');
  });

  it('rejects a recorder left running at a standstill — Gilles, 2026-09-04', () => {
    // The exact shape of the bug: enough points to look like a trace,
    // fifteen metres of GPS noise to show for them.
    const summary = summariseTrace(trace(40), { distanceMeters: 15, elapsedMs: 7 * HOUR });
    expect(summary.usable).toBe(false);
    expect(summary.reason).toBe('too-short');
  });

  it('rejects a recording that missed most of the outing', () => {
    // Twenty minutes recorded out of a seven-hour day: the distance is
    // real, but it is not the outing's distance.
    const summary = summariseTrace(trace(240), { distanceMeters: 1500, elapsedMs: 7 * HOUR });
    expect(summary.usable).toBe(false);
    expect(summary.reason).toBe('partial');
    expect(summary.coverage).toBeLessThan(MIN_COVERAGE);
  });

  it('counts only the recorded segments, not the breaks between them', () => {
    // Two half-hours of recording either side of a two-hour gap. The gap
    // is time nothing was watching, so it must not be credited as
    // coverage — otherwise a pause would make a trace look complete.
    const first = trace(360);
    const second = trace(360, 3 * HOUR);
    second[0].gap = true;
    const summary = summariseTrace([...first, ...second], {
      distanceMeters: 4000,
      elapsedMs: 4 * HOUR,
    });
    expect(summary.recordedMs).toBeCloseTo(2 * (359 * 5000), -3);
    expect(summary.coverage).toBeCloseTo(0.25, 2);
    expect(summary.reason).toBe('partial');
  });

  it('does not invent a doubt when there is no elapsed time to compare against', () => {
    // A session restored without a start time still deserves its figures
    // if the trace itself holds up.
    const summary = summariseTrace(trace(500), { distanceMeters: MIN_DISTANCE_M + 1, elapsedMs: 0 });
    expect(summary.coverage).toBe(1);
    expect(summary.usable).toBe(true);
  });

  it('treats an empty trace as unusable rather than throwing', () => {
    expect(summariseTrace([], {}).usable).toBe(false);
    expect(summariseTrace(undefined, {}).points).toBe(0);
  });
});

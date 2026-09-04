// The accumulator and the whole-trace function must never disagree.
//
// The recorder needs a running total after every fix; re-walking the
// trace each time is O(n²) over an outing, and the floating banner reads
// that total every five seconds for the whole day. So the loop was
// turned into an accumulator — and the only thing that matters about
// that change is that it produced exactly the same numbers.
//
// computeTraceMetrics is now built on the accumulator, so the seventeen
// calibration tests in trace-metrics.test.js already cover the split.
// What they cannot see is the *incremental* path: feeding points one at
// a time, in the order the GPS delivers them, with reads in between.

import { describe, expect, it } from 'vitest';

import { computeTraceMetrics, createTraceMetrics } from '@/pwa/trace-metrics';

// A deterministic climb with noise, in the shape the recorder produces:
// timestamps, accuracy, altitude, and an occasional recording break.
function makeTrace(count, { gapEvery = 0 } = {}) {
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      lat: 45.9 + i * 0.00008 + random() * 0.00006,
      lon: 6.86 + i * 0.00003 + random() * 0.00006,
      alt: 1200 + i * 0.35 + random() * 12,
      accuracy: 5 + Math.abs(random()) * 10,
      t: 1_700_000_000_000 + i * 5000,
      ...(gapEvery && i > 0 && i % gapEvery === 0 ? { gap: true } : {}),
    });
  }
  return points;
}

describe('createTraceMetrics', () => {
  it('matches computeTraceMetrics point by point on a long trace', () => {
    const trace = makeTrace(2000);
    const accumulator = createTraceMetrics();
    for (const point of trace) accumulator.push(point);

    expect(accumulator.result).toEqual(computeTraceMetrics(trace));
    // And the fixture is a real climb, not a degenerate one — otherwise
    // the equality above would be a comparison of two zeros.
    expect(accumulator.result.distance).toBeGreaterThan(500);
    expect(accumulator.result.gain).toBeGreaterThan(200);
  });

  it('agrees at every intermediate point, not only at the end', () => {
    // The recorder reads the total after each fix. An accumulator that
    // only converged at the end would still show wrong figures all day.
    const trace = makeTrace(120);
    const accumulator = createTraceMetrics();
    for (let i = 0; i < trace.length; i++) {
      accumulator.push(trace[i]);
      expect(accumulator.result).toEqual(computeTraceMetrics(trace.slice(0, i + 1)));
    }
  });

  it('carries recording breaks through the incremental path', () => {
    const trace = makeTrace(600, { gapEvery: 150 });
    const accumulator = createTraceMetrics();
    for (const point of trace) accumulator.push(point);
    expect(accumulator.result).toEqual(computeTraceMetrics(trace));
  });

  it('reads as zero before anything is pushed', () => {
    expect(createTraceMetrics().result).toEqual({ distance: 0, gain: 0, loss: 0 });
  });

  it('ignores junk without corrupting the totals', () => {
    const accumulator = createTraceMetrics();
    const trace = makeTrace(50);
    for (const point of trace) accumulator.push(point);
    const before = accumulator.result;

    accumulator.push(null);
    accumulator.push(undefined);
    accumulator.push({ lat: NaN, lon: 6 });
    accumulator.push({ lat: 45.9, lon: null });

    expect(accumulator.result).toEqual(before);
  });

  it('returns a fresh object each read, so a snapshot cannot be mutated under a reader', () => {
    const accumulator = createTraceMetrics();
    for (const point of makeTrace(30)) accumulator.push(point);
    const first = accumulator.result;
    accumulator.push({ lat: 46.1, lon: 6.9, alt: 1400, accuracy: 5, t: 1_700_000_400_000 });
    // The plugin hands `result` straight to a reactive field; if reads
    // aliased internal state, Vue would never see the change.
    expect(accumulator.result).not.toBe(first);
  });
});

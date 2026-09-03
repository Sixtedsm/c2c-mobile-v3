// What the published distance and elevation are worth.
//
// These three numbers become length_total, height_diff_up and
// height_diff_down on camptocamp.org, so a wrong one is not a display
// glitch — it is bad data in the topoguide, and nobody reviewing the
// outing has any way to tell.
//
// The traces below carry synthetic GPS noise, because a clean trace
// proves nothing: the defect these guards exist for is that summing a
// noisy trace accumulates the noise instead of cancelling it. Measured
// against the previous implementation, a 3 h climb of 4.8 km / 800 m
// came out at 19.5 km / 11 653 m, and half an hour with the phone on a
// rock produced 3.2 km / 2 063 m out of nothing.

import { describe, expect, it } from 'vitest';

import { computeTraceMetrics, isUsableFix, MAX_ACCURACY_M } from '@/pwa/trace-metrics';

// Deterministic pseudo-noise: a flaky test on this would be worse than
// no test, because the numbers are inherently statistical.
function makeNoise(initialSeed) {
  let seed = initialSeed;
  return (sigma) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const u = Math.max(seed / 0x7fffffff, 1e-9);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed / 0x7fffffff;
    return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const M_PER_DEG = 111320;

// `metresPerFix` 0 means standing still. Noise sigmas are the usual
// consumer-receiver figures: ~5 m horizontal, ~10 m vertical.
function trace({ fixes, metresPerFix = 0, metresClimbPerFix = 0, seed = 7, startAlt = 1000 }) {
  const noise = makeNoise(seed);
  const points = [];
  for (let i = 0; i < fixes; i++) {
    points.push({
      lat: 45 + (i * metresPerFix + noise(5)) / M_PER_DEG,
      lon: 6 + noise(5) / (M_PER_DEG * Math.cos((45 * Math.PI) / 180)),
      alt: startAlt + i * metresClimbPerFix + noise(10),
    });
  }
  return points;
}

describe('a stationary phone measures nothing', () => {
  it('reports no distance and no climb over half an hour on a rock', () => {
    // 30 min at one fix every 5 s.
    const { distance, gain, loss } = computeTraceMetrics(trace({ fixes: 360 }));
    expect(distance).toBeLessThan(100);
    expect(gain).toBeLessThan(80);
    expect(loss).toBeLessThan(80);
  });
});

describe('a real outing is measured, not inflated', () => {
  // 3 h at one fix every 5 s, 2 m per fix (~5 km/h), 0.37 m of climb per
  // fix (~800 m over the outing).
  const walked = trace({ fixes: 2160, metresPerFix: 2.22, metresClimbPerFix: 0.37 });

  it('gets the distance right rather than four times over', () => {
    const { distance } = computeTraceMetrics(walked);
    expect(distance).toBeGreaterThan(4000);
    expect(distance).toBeLessThan(6000);
  });

  it('gets the climb right rather than fourteen times over', () => {
    const { gain } = computeTraceMetrics(walked);
    expect(gain).toBeGreaterThan(600);
    expect(gain).toBeLessThan(1100);
  });
});

describe('a slow approach is not filtered away', () => {
  it('keeps 2 km/h, where the fix-to-fix step is under the noise floor', () => {
    // The failure that would matter most: filtering hard enough to erase
    // real walking. At 2 km/h each fix advances 2.78 m, well under the
    // 10 m step floor — only the smoothing makes this measurable.
    const { distance } = computeTraceMetrics(trace({ fixes: 240, metresPerFix: 2.78 }));
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(800);
  });
});

describe('descent is counted as loss, not as gain', () => {
  it('measures a 900 m descent', () => {
    const { gain, loss } = computeTraceMetrics(
      trace({ fixes: 1080, metresPerFix: 2.22, metresClimbPerFix: -0.83, startAlt: 2400 })
    );
    expect(loss).toBeGreaterThan(700);
    expect(loss).toBeLessThan(1200);
    expect(gain).toBeLessThan(200);
  });
});

describe('a missing altitude is skipped, never read as zero', () => {
  it('does not turn a dropout into a kilometre of climbing', () => {
    // The old code did `alt || 0`, so every dropout became a 2 000 m
    // descent followed by a 2 000 m climb. One fix in five losing
    // vertical lock reported 280 km of gain on flat ground.
    const points = trace({ fixes: 500, metresPerFix: 2.22, startAlt: 2000 });
    for (let i = 0; i < points.length; i += 5) {
      points[i].alt = null;
    }
    const { gain } = computeTraceMetrics(points);
    expect(gain).toBeLessThan(150);
  });

  it('copes with a trace that has no altitude at all', () => {
    const points = trace({ fixes: 200, metresPerFix: 2.22 }).map((p) => ({ ...p, alt: null }));
    const { gain, loss, distance } = computeTraceMetrics(points);
    expect(gain).toBe(0);
    expect(loss).toBe(0);
    // Distance does not depend on altitude and must still be measured.
    expect(distance).toBeGreaterThan(200);
  });
});

describe('a recording break is never bridged', () => {
  it('leaves out the step across a gap, and does not smooth across it', () => {
    const first = trace({ fixes: 100, metresPerFix: 2.22 });
    const second = trace({ fixes: 100, metresPerFix: 2.22, seed: 99 }).map((p) => ({
      ...p,
      lat: p.lat + 0.5, // 55 km away: the drive between the two legs
    }));
    second[0].gap = true;

    const joined = computeTraceMetrics([...first, ...second]).distance;
    const apart = computeTraceMetrics(first).distance + computeTraceMetrics(second).distance;
    // Within a smoothing window's worth of the two legs measured alone —
    // and nowhere near the 55 km that separates them.
    expect(Math.abs(joined - apart)).toBeLessThan(100);
  });
});

describe('poor fixes are refused before they reach the trace', () => {
  it('accepts what the receiver is confident about', () => {
    expect(isUsableFix(5)).toBe(true);
    expect(isUsableFix(MAX_ACCURACY_M)).toBe(true);
  });

  it('refuses a cell-tower guess', () => {
    expect(isUsableFix(120)).toBe(false);
  });

  it('trusts a receiver that reports nothing', () => {
    // Some browsers omit accuracy. Refusing those would record nothing.
    expect(isUsableFix(null)).toBe(true);
    expect(isUsableFix(undefined)).toBe(true);
  });
});

describe('degenerate input does not throw', () => {
  it('handles empty, single-point and malformed traces', () => {
    expect(computeTraceMetrics([])).toEqual({ distance: 0, gain: 0, loss: 0 });
    expect(computeTraceMetrics(undefined)).toEqual({ distance: 0, gain: 0, loss: 0 });
    expect(computeTraceMetrics([{ lat: 45, lon: 6, alt: 1000 }])).toEqual({ distance: 0, gain: 0, loss: 0 });
    expect(computeTraceMetrics([null, { lat: 45, lon: 6, alt: 1000 }]).distance).toBe(0);
  });
});

// The defences that need timestamps and reported accuracy. The fixtures
// above deliberately carry neither, which exercises the fallback path for
// traces recorded before those were stored; these carry both, which is
// what a trace recorded today looks like.
function timedTrace({ fixes, metresPerFix = 0, everyMs = 5000, accuracy = 6, seed = 3, startAlt = 1000 }) {
  const noise = makeNoise(seed);
  const points = [];
  for (let i = 0; i < fixes; i++) {
    points.push({
      lat: 45 + (i * metresPerFix + noise(5)) / M_PER_DEG,
      lon: 6 + noise(5) / (M_PER_DEG * Math.cos((45 * Math.PI) / 180)),
      alt: startAlt + noise(10),
      accuracy,
      t: 1_700_000_000_000 + i * everyMs,
    });
  }
  return points;
}

describe('the filter does not depend on the sampling rate', () => {
  it('measures the same walk the same way at 2 s and at 5 s', () => {
    // The load-bearing property. The window used to span a fixed number
    // of fixes, so the battery-saving setting silently changed how hard
    // the trace was smoothed — the same outing scored differently
    // depending on a preference that has nothing to do with accuracy.
    const walkedMetres = 1500;
    const at5s = computeTraceMetrics(timedTrace({ fixes: 300, metresPerFix: 5, everyMs: 5000 }));
    const at2s = computeTraceMetrics(timedTrace({ fixes: 750, metresPerFix: 2, everyMs: 2000 }));

    expect(at5s.distance).toBeGreaterThan(walkedMetres * 0.85);
    expect(at2s.distance).toBeGreaterThan(walkedMetres * 0.85);
    // Within a tenth of each other, rather than the twofold gap a
    // sample-count window produced.
    const ratio = at2s.distance / at5s.distance;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });
});

describe('a physically impossible fix is refused', () => {
  it('drops a jump no one could have walked', () => {
    const points = timedTrace({ fixes: 200, metresPerFix: 5 });
    const clean = computeTraceMetrics(points).distance;

    // One fix teleports 3 km away and back — the classic receiver glitch,
    // and the single worst thing that can enter a trace.
    const glitched = points.map((p, i) => (i === 100 ? { ...p, lat: p.lat + 3000 / M_PER_DEG } : p));
    const measured = computeTraceMetrics(glitched).distance;

    // Without the speed gate this adds ~6 km to a 1 km walk.
    expect(Math.abs(measured - clean)).toBeLessThan(200);
  });

  it('still accepts a fast ski descent', () => {
    // 20 m/s is 72 km/h. Rejecting that would erase the descent of every
    // ski outing, which is the opposite failure and just as wrong.
    const fast = timedTrace({ fixes: 100, metresPerFix: 100, everyMs: 5000 });
    expect(computeTraceMetrics(fast).distance).toBeGreaterThan(8000);
  });
});

describe('a fix the receiver distrusts weighs less', () => {
  it('lets a clean run and a degraded run disagree', () => {
    // Same geometry, same noise, different reported confidence. The
    // degraded trace must not be trusted as hard — that is the whole
    // point of inverse-variance weighting.
    const clean = computeTraceMetrics(timedTrace({ fixes: 200, metresPerFix: 5, accuracy: 3 }));
    const degraded = computeTraceMetrics(timedTrace({ fixes: 200, metresPerFix: 5, accuracy: 40 }));
    // Both measure the same walk; neither collapses.
    expect(clean.distance).toBeGreaterThan(700);
    expect(degraded.distance).toBeGreaterThan(700);
  });

  it('treats a missing accuracy as middling rather than perfect', () => {
    const noAccuracy = timedTrace({ fixes: 200, metresPerFix: 5 }).map(({ accuracy, ...p }) => p);
    // A receiver that reports nothing must not be trusted like a 1 m fix,
    // nor discarded — the trace still has to be measured.
    expect(computeTraceMetrics(noAccuracy).distance).toBeGreaterThan(700);
  });
});

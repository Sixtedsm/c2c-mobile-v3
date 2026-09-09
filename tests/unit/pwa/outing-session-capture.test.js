// What the recorder puts in the trace, and what it refuses to.
//
// Three changes are locked in here. Sampling is uniform in time, because
// the 3 m step filter that used to sit at capture time was asymmetric
// (it kept excursions over 3 m and dropped everything under, selecting
// noise rather than rejecting it) and rate-dependent, in exactly the
// direction trace-metrics is built to avoid. Timestamps are strictly
// increasing, because a receiver clock going backwards froze the sampler
// and stopped the smoothing window from ever evicting. And the trace has
// a ceiling it announces instead of a head it quietly trims.

import Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import install, { MAX_TRACE_POINTS } from '@/js/vue-plugins/outing-session';
import { computeTraceMetrics } from '@/pwa/trace-metrics';

function makeGeo() {
  const watches = new Map();
  let next = 1;
  return {
    watches,
    cleared: [],
    watchPosition(onOk, onErr) {
      const id = next++;
      watches.set(id, { onOk, onErr });
      return id;
    },
    clearWatch(id) {
      this.cleared.push(id);
      watches.delete(id);
    },
    getCurrentPosition() {},
    fire(lat, lon, t, accuracy = 5) {
      for (const w of watches.values()) {
        w.onOk({ coords: { latitude: lat, longitude: lon, altitude: 1000, accuracy }, timestamp: t });
      }
    },
  };
}

let geo;
const BASE = 1_700_000_000_000;

async function flush() {
  await Vue.nextTick();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await Vue.nextTick();
}

function mount() {
  const LocalVue = Vue.extend();
  install(LocalVue);
  return LocalVue.prototype.$outingSession;
}

beforeEach(() => {
  window.localStorage.clear();
  geo = makeGeo();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(async () => ({ release: vi.fn(), addEventListener() {} })) },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sampling is uniform in time', () => {
  it('keeps recording a user standing still, one point per interval', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    // A minute at the summit, GPS delivering every second, nobody moving.
    // The old capture filter dropped almost all of this, which is what
    // made the trace non-uniform exactly where uniformity matters most.
    for (let i = 0; i < 60; i++) geo.fire(45.9, 6.86, BASE + i * 1000);
    await flush();

    // 5 s default interval over 59 s of fixes.
    expect(s.positions.length).toBeGreaterThanOrEqual(11);
    expect(s.positions.length).toBeLessThanOrEqual(13);

    const spacings = s.positions.slice(1).map((p, i) => p.t - s.positions[i].t);
    for (const spacing of spacings) {
      expect(spacing).toBeGreaterThanOrEqual(4500);
      expect(spacing).toBeLessThanOrEqual(5500);
    }

    // And the downstream filtering still does its job: standing still is
    // not distance. This is the property the capture filter was informally
    // standing in for, now written down where it belongs.
    expect(computeTraceMetrics(s.positions).distance).toBeLessThan(50);
  });

  it('records slow movement the step filter used to throw away', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    // ~1.4 m every 5 s: a steep couloir, well under the old 3 m floor.
    for (let i = 0; i < 40; i++) geo.fire(45.9 + i * 0.0000125, 6.86, BASE + i * 5000);
    await flush();

    expect(s.positions.length).toBeGreaterThan(30);
  });

  it('still drops a fix the receiver reports as poor', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    geo.fire(45.9, 6.86, BASE, 5);
    // 300 m of claimed accuracy is a cell-tower guess, not a position.
    geo.fire(46.5, 7.5, BASE + 6000, 300);
    geo.fire(45.9002, 6.86, BASE + 12000, 5);
    await flush();

    expect(s.positions).toHaveLength(2);
  });
});

describe('a receiver clock going backwards does not stall the recorder', () => {
  it('keeps sampling and keeps timestamps strictly increasing', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    geo.fire(45.9, 6.86, BASE);
    geo.fire(45.9001, 6.86, BASE + 6000);
    // The clock jumps back an hour mid-outing. The throttle compares
    // against this, and a negative delta never clears — every later fix
    // used to be dropped until the clock caught up.
    geo.fire(45.9002, 6.86, BASE - 3600_000);
    geo.fire(45.9003, 6.86, BASE - 3600_000 + 1000);
    await flush();

    expect(s.positions.length).toBeGreaterThanOrEqual(3);
    const times = s.positions.map((p) => p.t);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it('accepts a receiver whose clock is simply in the wrong era', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    // Consistent, just years off. Every reader of the timestamp takes a
    // difference, so the offset is harmless — and rejecting it would
    // collapse the whole trace onto Date.now(), landing every fix in the
    // same millisecond, which is the input that really does destroy it.
    const OLD = 1_000_000_000_000;
    for (let i = 0; i < 20; i++) geo.fire(45.9 + i * 0.0001, 6.86, OLD + i * 6000);
    await flush();

    expect(s.positions.length).toBeGreaterThan(15);
    expect(s.tracedDistanceMeters).toBeGreaterThan(50);
  });

  it('measures liveness on the wall clock, not on the receiver', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    geo.fire(45.9, 6.86, 1_000_000_000_000);
    await flush();

    // Taking liveness from the receiver made a phone with a skewed clock
    // report an age of years, and the watchdog tore the watch down every
    // thirty seconds for the whole outing chasing a drought that was not
    // there.
    expect(s.fixAgeMs()).toBeLessThan(60 * 1000);
    expect(s.gpsSilent).toBe(false);
  });
});

describe('the trace has a ceiling it announces', () => {
  it('stops appending at the cap without trimming the head', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    // Fill it directly: firing twenty thousand fixes through the watch
    // would test the harness, not the cap.
    s.positions = Array.from({ length: MAX_TRACE_POINTS }, (_, i) => ({
      lat: 45.9 + i * 1e-6,
      lon: 6.86,
      alt: 1000,
      accuracy: 5,
      t: BASE + i * 5000,
    }));
    await flush();
    const firstT = s.positions[0].t;

    geo.fire(46.5, 7.0, BASE + MAX_TRACE_POINTS * 5000 + 60_000);
    await flush();

    expect(s.traceFull).toBe(true);
    expect(s.positions).toHaveLength(MAX_TRACE_POINTS);
    // The head is what a trimming cap would have eaten, silently
    // rewriting length_total and height_diff_up on an outing the user
    // believes is fully recorded.
    expect(s.positions[0].t).toBe(firstT);
  });

  it('keeps liveness alive at the cap so the watchdog still works', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    s.positions = Array.from({ length: MAX_TRACE_POINTS }, (_, i) => ({
      lat: 45.9,
      lon: 6.86,
      accuracy: 5,
      t: BASE + i * 5000,
    }));
    await flush();

    s.lastFixAt = Date.now() - 300_000;
    geo.fire(45.9, 6.86, Date.now());
    await flush();

    expect(s.fixAgeMs()).toBeLessThan(10_000);
  });

  it('clears the ceiling when a new outing starts', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    s.traceFull = true;

    s.start({ type: 'route', id: 2, lang: 'fr' }, { track: true });
    await flush();

    expect(s.traceFull).toBe(false);
  });
});

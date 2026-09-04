// Pausing an outing (CDC §2.4).
//
// "Reprendre plus tard" already stopped the GPS and kept the session
// alive, so the feature looked present. It was not: there was no way to
// resume, and — the part that matters — the break was counted as outing
// time and as ground covered. Those figures are not cosmetic: distance
// and elevation feed length_total / height_diff_up / height_diff_down on
// the outing published to camptocamp.org. A pause was publishing bad
// data, which is why this is a data-quality fix.
//
// The invariant these tests pin: a step across a recording break never
// counts. It holds whichever way the break happened — an explicit pause,
// or the GPS checkbox toggled off and on — and it must NOT be applied to
// a watchdog rebuild, where the user really did walk that ground.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import install from '@/js/vue-plugins/outing-session';

// Controllable geolocation. Unlike the GPS-watchdog harness this one
// takes an altitude per fix, because elevation is one of the published
// figures under test.
function makeGeo() {
  const watches = new Map();
  let next = 1;
  return {
    watches,
    watchPosition(onOk, onErr) {
      const id = next++;
      watches.set(id, { onOk, onErr });
      return id;
    },
    clearWatch(id) {
      watches.delete(id);
    },
    getCurrentPosition() {},
    fire(lat, lon, t, alt = 1000) {
      for (const w of watches.values()) {
        w.onOk({ coords: { latitude: lat, longitude: lon, altitude: alt, accuracy: 5 }, timestamp: t });
      }
    },
  };
}

// Epoch-scale so the sampler throttle behaves as it does on a phone.
const BASE = 1_700_000_000_000;

let geo;

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
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(async () => ({ release: vi.fn(), addEventListener() {} })) },
  });
});

// A leg of `count` fixes walking north from `lat`, climbing `climb`
// metres in total.
//
// Legs are long enough for the smoothing window to fill. Metrics are
// measured on a smoothed trace (src/pwa/trace-metrics.js), so a
// four-point fixture would mostly measure the filter warming up rather
// than the behaviour under test.
function fireLeg(lat, alt, count, climb, startT) {
  const stepDeg = 0.0001; // ~11 m between fixes
  for (let i = 0; i < count; i++) {
    geo.fire(lat + i * stepDeg, 6.0, startT + i * 6000, alt + (climb * i) / count);
  }
}

// Two legs of ~440 m each, separated by a break during which the user
// travelled 55 km. Only the two legs were walked.
async function traceWithBreak(vm, breakIt) {
  vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
  await flush();
  fireLeg(45.0, 1000, 40, 100, BASE);
  await flush();

  await breakIt();
  await flush();

  fireLeg(45.5, 2000, 40, 50, BASE + 300000);
  await flush();
}

describe('a break in the recording is never counted as ground covered', () => {
  it('leaves the pause jump out of the distance', async () => {
    const vm = mount();
    await traceWithBreak(vm, async () => {
      vm.pause();
      await flush();
      vm.resume();
    });

    // The first fix of the second leg opens a new segment.
    expect(vm.positions.filter((p) => p.gap)).toHaveLength(1);
    // Two legs of ~440 m. Counting the jump across the break would
    // report ~55 km — and publish it as length_total. The bounds are
    // loose on purpose: smoothing trims a little at each segment edge,
    // and pinning an exact figure would break on any re-tuning.
    expect(vm.tracedDistanceMeters).toBeGreaterThan(500);
    expect(vm.tracedDistanceMeters).toBeLessThan(1200);
  });

  it('leaves the pause jump out of the elevation', async () => {
    const vm = mount();
    await traceWithBreak(vm, async () => {
      vm.pause();
      await flush();
      vm.resume();
    });

    // ~100 m then ~50 m of real climbing. The 900 m step across the
    // break belongs to the drive up, not to the outing — counting it
    // would roughly double the published height_diff_up.
    expect(vm.elevationGainMeters).toBeGreaterThan(80);
    expect(vm.elevationGainMeters).toBeLessThan(200);
    expect(vm.elevationLossMeters).toBeLessThan(20);
  });

  it('applies to the GPS checkbox too, not just to an explicit pause', async () => {
    const vm = mount();
    // Someone saving battery on a long approach never touches "pause",
    // yet leaves exactly the same hole in the trace.
    await traceWithBreak(vm, async () => {
      vm.gpsTracking = false;
      await flush();
      vm.gpsTracking = true;
    });

    expect(vm.positions.filter((p) => p.gap)).toHaveLength(1);
    expect(vm.tracedDistanceMeters).toBeLessThan(1200);
  });

  it('does not flag a watchdog rebuild, where the ground was really walked', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    fireLeg(45.0, 1000, 20, 0, BASE);
    await flush();

    // Fixes dried up and the watchdog rebuilt the watch. The user kept
    // moving throughout, so dropping that ground would under-report the
    // outing — the opposite error, and just as wrong.
    vm.restartGpsWatch();
    await flush();
    fireLeg(45.002, 1000, 20, 0, BASE + 200000);
    await flush();

    expect(vm.positions.some((p) => p.gap)).toBe(false);
    expect(vm.tracedDistanceMeters).toBeGreaterThan(200);
  });
});

describe('paused time is not outing time', () => {
  it('accumulates the break and stops charging it once resumed', () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' });
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    vm.pause();
    vi.spyOn(Date, 'now').mockReturnValue(70_000);
    vm.resume();

    expect(vm.pausedMs).toBe(60_000);
    expect(vm.paused).toBe(false);
    expect(vm.pausedAt).toBeNull();
    vi.restoreAllMocks();
  });

  it('does not restart the clock when pause is tapped twice', () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' });
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    vm.pause();
    // A second tap — or a re-render — must not forgive the break that
    // is already running.
    vi.spyOn(Date, 'now').mockReturnValue(40_000);
    vm.pause();
    vi.spyOn(Date, 'now').mockReturnValue(70_000);
    vm.resume();

    expect(vm.pausedMs).toBe(60_000);
    vi.restoreAllMocks();
  });

  it('refuses to pause when no outing is running', () => {
    const vm = mount();
    vm.pause();
    expect(vm.paused).toBe(false);
    expect(vm.pausedAt).toBeNull();
  });
});

describe('a pause survives the app being closed', () => {
  it('comes back paused, with the break still running', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    vm.pause();
    await flush();

    // The phone in a pocket during a long break is exactly when the tab
    // gets killed. Coming back unpaused would charge the whole break to
    // the outing.
    const revived = mount();
    expect(revived.paused).toBe(true);
    expect(revived.pausedAt).toBeTruthy();
    expect(revived.sessionActive).toBe(true);
  });

  it('starts a new outing with a clean slate', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' });
    vm.pause();
    await flush();

    vm.start({ type: 'route', id: 2, lang: 'fr' });
    expect(vm.paused).toBe(false);
    expect(vm.pausedMs).toBe(0);
    expect(vm.pausedAt).toBeNull();
  });
});

describe('GPX marks the break as a real segment boundary', () => {
  it('opens a new trkseg after a pause', async () => {
    const vm = mount();
    await traceWithBreak(vm, async () => {
      vm.pause();
      await flush();
      vm.resume();
    });

    const gpx = vm.exportGpx();
    // Without the boundary any reader redraws the straight line across
    // the gap and recomputes the distance we just stopped counting.
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx.match(/<\/trkseg>/g)).toHaveLength(2);
  });
});

// Feedback Gilles (forum, sortie réelle 2026-09): "11 points pour 3 h de
// marche". The screen-lock bug was fixed earlier; this covers the other
// half of that symptom, which nothing was watching for — the phone
// killing the tab. On reload the session came back looking perfectly
// normal, with the GPS silently off, and the rest of the walk recorded
// nothing at all.
describe('a recording killed with the app does not come back silent', () => {
  it('flags the interruption when the app is reloaded mid-recording', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    geo.fire(45.0, 6.0, BASE, 1000);
    await flush();

    // No stop, no pause: the tab is simply gone, as it is whenever the
    // OS reclaims memory from a locked phone.
    const revived = mount();
    expect(revived.sessionActive).toBe(true);
    expect(revived.gpsTracking).toBe(false);
    expect(revived.recordingInterrupted).toBe(true);
  });

  it('does not flag a session that was deliberately paused', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    vm.pause();
    await flush();

    // The user chose this. Telling them their recording broke would be
    // both wrong and alarming.
    const revived = mount();
    expect(revived.paused).toBe(true);
    expect(revived.recordingInterrupted).toBe(false);
  });

  it('does not flag a session started without tracking', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' });
    await flush();

    const revived = mount();
    expect(revived.recordingInterrupted).toBe(false);
  });

  it('clears the flag once recording is picked back up', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    const revived = mount();
    expect(revived.recordingInterrupted).toBe(true);
    revived.resume();
    await flush();
    expect(revived.recordingInterrupted).toBe(false);
  });
});

// The keep-alive plays an inaudible clip so the phone does not suspend the
// page once the screen is off. Starting playback is asynchronous, and the
// user can stop recording while it is still starting — toggling the GPS
// checkbox twice in a second is enough. If the clip then switches itself
// on, it plays with nothing left to record: a media control sits on the
// lock screen, the battery pays for it, and the menu claims the recording
// is being held.
describe('the keep-alive never outlives the recording', () => {
  it('does not switch on after recording has already stopped', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    // Stop before the audio had any chance to finish starting.
    vm.gpsTracking = false;
    await flush();

    expect(vm.keepAliveActive).toBe(false);
  });

  it('is off once the outing is stopped', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    vm.stop();
    await flush();

    expect(vm.keepAliveActive).toBe(false);
    expect(vm.gpsTracking).toBe(false);
  });

  it('is off while the outing is paused', async () => {
    const vm = mount();
    vm.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    vm.pause();
    await flush();

    // Nothing is being recorded during a pause, so nothing should be
    // holding the phone awake for it.
    expect(vm.keepAliveActive).toBe(false);
  });
});

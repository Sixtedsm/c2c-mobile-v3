// Regression guard for audit item C-1: GPS tracking used to die the
// moment the screen locked. Sixte's 1 h run on 2026-09-02 recorded 3
// points — one for each time he woke the screen and the watch briefly
// re-armed. These tests encode the fixed behaviour so it cannot come
// back.

import Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import install from '@/js/vue-plugins/outing-session';

// A controllable geolocation stub: hand it fixes, watch it hand them
// to the plugin.
function makeGeo() {
  const watches = new Map();
  let next = 1;
  return {
    watches,
    cleared: [],
    watchPosition(onOk, onErr, opts) {
      const id = next++;
      watches.set(id, { onOk, onErr, opts });
      return id;
    },
    clearWatch(id) {
      this.cleared.push(id);
      watches.delete(id);
    },
    getCurrentPosition() {},
    // Deliver a fix to every live watch.
    fire(lat, lon, t) {
      for (const w of watches.values()) {
        w.onOk({ coords: { latitude: lat, longitude: lon, altitude: 1000, accuracy: 5 }, timestamp: t });
      }
    },
    fireError(code) {
      for (const w of watches.values()) w.onErr({ code });
    },
  };
}

let geo;
let releaseSpy;

// Let Vue's watcher queue and any pending promise chains settle.
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

function setHidden(v) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  window.localStorage.clear();
  geo = makeGeo();
  releaseSpy = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(async () => ({ release: releaseSpy, addEventListener() {} })) },
  });
});

afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
});

describe('GPS tracking — screen lock must not stop the recording (audit C-1)', () => {
  it('keeps the watch alive when the tab goes hidden', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();

    expect(s.watchId).not.toBeNull();
    const idBefore = s.watchId;

    // Phone locks its screen mid-run.
    setHidden(true);
    await Vue.nextTick();

    // Before the fix this flipped to false and cleared the watch.
    expect(s.gpsTracking).toBe(true);
    expect(s.watchId).toBe(idBefore);
    expect(geo.cleared).not.toContain(idBefore);
  });

  it('keeps recording points while hidden', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();

    const t0 = Date.now();
    geo.fire(45.0, 6.0, t0);
    setHidden(true);
    await Vue.nextTick();

    // Two more fixes, far enough apart in time and distance to be kept.
    geo.fire(45.01, 6.0, t0 + 10000);
    geo.fire(45.02, 6.0, t0 + 20000);

    // Before the fix the watch was gone and these went nowhere.
    expect(s.positions.length).toBe(3);
  });
});

describe('GPS tracking — wake lock (audit C-1)', () => {
  it('holds a screen wake lock while recording and releases it on stop', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(s.wakeLockActive).toBe(true);

    s.gpsTracking = false;
    await flush();

    expect(releaseSpy).toHaveBeenCalled();
    expect(s.wakeLockActive).toBe(false);
  });
});

describe('GPS tracking — watchdog rebuilds a dead watch (audit C-1)', () => {
  it('restarts the watch when fixes dry up', async () => {
    vi.useFakeTimers();
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();

    const idBefore = s.watchId;

    // Simulate the OS suspending the watch: the last fix is two minutes
    // old and none are arriving. Nothing else signals this — a suspended
    // watch delivers neither a position nor an error, which is exactly
    // why the watchdog has to look at the fix drought itself.
    s.lastFixAt = Date.now() - 120 * 1000;
    vi.advanceTimersByTime(35 * 1000);

    expect(geo.cleared).toContain(idBefore);
    expect(s.watchId).not.toBe(idBefore);
    expect(s.watchId).not.toBeNull();
  });
});

describe('GPS tracking — permission denial is terminal (audit C-1)', () => {
  it('stops tracking on PERMISSION_DENIED instead of retrying forever', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();

    geo.fireError(1); // PERMISSION_DENIED
    await Vue.nextTick();

    expect(s.gpsTracking).toBe(false);
  });

  it('keeps tracking through a transient TIMEOUT', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();

    geo.fireError(3); // TIMEOUT
    await Vue.nextTick();

    expect(s.gpsTracking).toBe(true);
  });
});

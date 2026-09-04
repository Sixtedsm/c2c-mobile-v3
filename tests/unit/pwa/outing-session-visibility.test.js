// A recording that stops has to say so.
//
// Every field report so far has the same shape: the app went on looking
// like it was recording while nothing arrived. This file locks in the
// three places that silence used to come from — a watchdog that erased
// the evidence of the drought it repaired, a geolocation error nobody
// rendered, and a lock-screen media button wired to pause the outing.

import Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Captured from the plugin's call to backgroundAudio.start(), so the
// test can play the part of the OS taking audio focus away.
let stopRequest = null;

vi.mock('@/pwa/background-audio', () => ({
  start: vi.fn(async ({ onStopRequest } = {}) => {
    stopRequest = onStopRequest;
    return true;
  }),
  stop: vi.fn(),
  resume: vi.fn(async () => true),
  isActive: vi.fn(() => true),
}));

import install from '@/js/vue-plugins/outing-session';

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

// A Permissions API stub whose state the test can move, the way the OS
// settings screen moves it under a walking user.
function makePermissions(initial = 'granted') {
  const status = { state: initial, onchange: null };
  return {
    status,
    query: vi.fn(async () => status),
    setState(next) {
      status.state = next;
      status.onchange?.();
    },
  };
}

let geo;
let permissions;

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

const BASE = 1_700_000_000_000;

beforeEach(() => {
  window.localStorage.clear();
  stopRequest = null;
  geo = makeGeo();
  permissions = makePermissions();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: permissions });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(async () => ({ release: vi.fn(), addEventListener() {} })) },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a drought is visible instead of erased', () => {
  it('does not reset the fix age when the watchdog rebuilds the watch', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    geo.fire(45, 6, BASE);
    await flush();
    const fixAt = s.lastFixAt;

    s.restartGpsWatch();

    // The old implementation set lastFixAt = Date.now() here, which made
    // a suspended watch indistinguishable from a healthy one for the
    // next minute — including to the UI.
    expect(s.lastFixAt).toBe(fixAt);
    expect(s.watchStartedAt).not.toBeNull();
  });

  it('raises gpsSilent when fixes dry up and lowers it when one lands', async () => {
    vi.useFakeTimers();
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();

    s.lastFixAt = Date.now() - 120 * 1000;
    expect(s.gpsSilent).toBe(false); // nothing has looked yet

    vi.advanceTimersByTime(31 * 1000); // one watchdog tick
    expect(s.gpsSilent).toBe(true);

    geo.fire(45, 6, Date.now());
    expect(s.gpsSilent).toBe(false);
  });

  it('reports a growing age rather than a frozen one', async () => {
    vi.useFakeTimers();
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();
    geo.fire(45, 6, Date.now());

    const first = s.fixAgeMs();
    vi.advanceTimersByTime(90 * 1000);
    // As a computed over Date.now() this stayed frozen at its first
    // value for the whole drought — Vue has no reactive dependency on
    // the wall clock, so the watchdog would have called a dead watch
    // healthy forever.
    expect(s.fixAgeMs()).toBeGreaterThan(first + 60 * 1000);
  });

  it('rebuilds a silent watch, but only after a patient retry', async () => {
    vi.useFakeTimers();
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await Vue.nextTick();
    const idBefore = s.watchId;

    s.lastFixAt = Date.now() - 120 * 1000;

    // First tick: silent, but the watch is only 30 s old — left alone,
    // so a tunnel gets a patient retry instead of continuous churn.
    vi.advanceTimersByTime(31 * 1000);
    expect(geo.cleared).not.toContain(idBefore);

    // Second tick: the watch has had a full staleness window. Rebuild.
    vi.advanceTimersByTime(30 * 1000);
    expect(geo.cleared).toContain(idBefore);
  });
});

describe('a lock-screen media control is not a stop button', () => {
  it('withdraws the background guarantee without pausing the outing', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    expect(typeof stopRequest).toBe('function');
    expect(s.keepAliveActive).toBe(true);

    // A headset button, a car pairing over Bluetooth, another app taking
    // audio focus. This used to pause the outing — clock and GPS — on
    // someone halfway up a couloir.
    stopRequest();
    await flush();

    expect(s.keepAliveActive).toBe(false);
    expect(s.paused).toBe(false);
    expect(s.gpsTracking).toBe(true);
    expect(s.sessionActive).toBe(true);
  });
});

describe('permission changes are noticed', () => {
  it('reads the permission state at boot', async () => {
    const s = mount();
    await flush();
    expect(s.geoPermission).toBe('granted');
  });

  it('stops recording with a reportable error when the permission is revoked', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    // Revoking from the OS settings produces no error callback at all —
    // the fixes simply stop. Only the Permissions API tells us.
    permissions.setState('denied');
    await flush();

    expect(s.geoPermission).toBe('denied');
    expect(s.gpsTracking).toBe(false);
    // Same shape the watch's own error callback produces, so it flows
    // through the app's single geolocation wording helper.
    expect(s.geoError).toEqual({ code: 1 });
  });

  it('survives a browser without the Permissions API', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
    const s = mount();
    await flush();
    expect(s.geoPermission).toBe('unknown');
    expect(await s.queryGeoPermission()).toBe('unknown');
  });
});

describe('changing the sampling interval does not cut the trace', () => {
  it('rebuilds the watch without flagging a gap', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();

    // Two points far enough apart to be kept.
    geo.fire(45.0, 6.0, BASE);
    geo.fire(45.001, 6.0, BASE + 6000);
    await flush();
    const before = s.positions.length;
    const idBefore = s.watchId;

    s.applyGpsInterval();
    await flush();

    geo.fire(45.002, 6.0, BASE + 12000);
    await flush();

    expect(s.watchId).not.toBe(idBefore);
    expect(s.positions.length).toBeGreaterThan(before);
    // AppSettings used to toggle gpsTracking off and on to apply a new
    // interval, which runs the watcher and splits the trace and the GPX
    // in two at an arbitrary settings change.
    expect(s.positions.some((point) => point.gap)).toBe(false);
  });
});

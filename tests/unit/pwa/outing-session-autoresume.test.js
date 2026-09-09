// The app picks the recording back up by itself.
//
// It used to come back from an OS kill with the GPS off and a warning in
// a dropdown menu — deliberately, so as not to drain a battery the user
// had not re-authorised. But they had: they started the recording, and
// the phone ended it against their will. Leaving it off turned a system
// hiccup into permanent data loss, and Gilles walked seven hours without
// ever opening the menu that would have told him.
//
// The two boundaries this file defends are what makes that safe: never
// against an explicit pause, and never before the trace is back — the
// discontinuity flag is only armed when there are already points, so
// resuming first would splice the walk back to the car onto the trace.

import Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let keepAliveShouldSucceed = false;
let keepAliveStarted = 0;

vi.mock('@/pwa/background-audio', () => ({
  start: vi.fn(async () => {
    keepAliveStarted += 1;
    return keepAliveShouldSucceed;
  }),
  stop: vi.fn(),
  resume: vi.fn(async () => keepAliveShouldSucceed),
  isActive: vi.fn(() => keepAliveShouldSucceed),
}));

import install from '@/js/vue-plugins/outing-session';
import { newTraceId, writeTail } from '@/pwa/trace-store';

import { clear } from 'idb-keyval';

const STORAGE_KEY = 'v3.outingSession';
const BASE = 1_700_000_000_000;

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
  };
}

function makePermissions(initial = 'granted') {
  const status = { state: initial, onchange: null };
  return { status, query: vi.fn(async () => status) };
}

let geo;

async function flush() {
  await Vue.nextTick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await Vue.nextTick();
}

function mount() {
  const LocalVue = Vue.extend();
  install(LocalVue);
  return LocalVue.prototype.$outingSession;
}

// Lay down a session that was recording when the phone killed the tab:
// metadata in localStorage, points in IndexedDB.
async function seedInterruptedSession(overrides = {}) {
  const traceId = newTraceId();
  const points = Array.from({ length: 40 }, (_, i) => ({
    lat: 45.9 + i * 0.0001,
    lon: 6.86,
    alt: 1000 + i,
    accuracy: 5,
    t: BASE + i * 6000,
  }));
  await writeTail(traceId, points, 0);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schema: 2,
      sessionActive: true,
      gpsTracking: false,
      wasTracking: true,
      topoRef: { type: 'route', id: 5, lang: 'fr' },
      startedAt: Date.now() - 3600_000,
      paused: false,
      pausedAt: null,
      pausedMs: 0,
      traceId,
      tracePoints: points.length,
      ...overrides,
    })
  );
  return { traceId, points };
}

beforeEach(async () => {
  keepAliveShouldSucceed = false;
  keepAliveStarted = 0;
  window.localStorage.clear();
  await clear();
  geo = makeGeo();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: makePermissions('granted') });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(async () => ({ release: vi.fn(), addEventListener() {} })) },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('an interrupted recording restarts itself', () => {
  it('is still off synchronously, and on once the trace is back', async () => {
    await seedInterruptedSession();
    const s = mount();

    // Before any await: nothing may re-arm a watch over a trace that has
    // not finished loading. The older suites assert exactly this line,
    // which is why they keep passing unchanged.
    expect(s.gpsTracking).toBe(false);
    expect(s.recordingInterrupted).toBe(true);

    await s.whenTraceReady();
    await flush();

    expect(s.gpsTracking).toBe(true);
    expect(s.autoResumed).toBe(true);
    expect(s.positions).toHaveLength(40);
    // The watcher clears this; autoResumed carries the meaning onwards.
    expect(s.recordingInterrupted).toBe(false);
  });

  it('marks the break so the stretch walked meanwhile is not counted', async () => {
    await seedInterruptedSession();
    const s = mount();
    await s.whenTraceReady();
    await flush();

    // The user walked on while the app was dead, then it came back.
    // Without the flag, the straight line across that gap joins the
    // published distance and dénivelé.
    geo.fire(46.4, 7.4, BASE + 600_000);
    geo.fire(46.4001, 7.4, BASE + 606_000);
    await flush();

    expect(s.positions.filter((point) => point.gap)).toHaveLength(1);
    expect(s.positions[40].gap).toBe(true);
  });

  it('says the background hold could not follow, and can be retried by a tap', async () => {
    await seedInterruptedSession();
    const s = mount();
    await s.whenTraceReady();
    await flush();

    // A reload is not a user gesture, so the autoplay policy refuses the
    // silent audio. Pocketing the phone now would suspend the page.
    expect(s.keepAliveBlocked).toBe(true);
    expect(s.keepAliveActive).toBe(false);

    keepAliveShouldSucceed = true;
    const ok = await s.retryKeepAlive();
    await flush();

    expect(ok).toBe(true);
    expect(s.keepAliveBlocked).toBe(false);
    expect(s.keepAliveActive).toBe(true);
  });

  it('leaves the warning up when the retry also fails', async () => {
    await seedInterruptedSession();
    const s = mount();
    await s.whenTraceReady();
    await flush();

    const before = keepAliveStarted;
    expect(await s.retryKeepAlive()).toBe(false);
    expect(keepAliveStarted).toBeGreaterThan(before);
    expect(s.keepAliveBlocked).toBe(true);
  });
});

describe('what must never restart itself', () => {
  it('does not override a deliberate pause', async () => {
    await seedInterruptedSession({ paused: true, pausedAt: Date.now() - 60_000 });
    const s = mount();
    await s.whenTraceReady();
    await flush();

    // A pause is the user saying stop. Only an interruption is the phone
    // saying it, and only that may be undone without asking.
    expect(s.paused).toBe(true);
    expect(s.gpsTracking).toBe(false);
    expect(s.autoResumed).toBe(false);
  });

  it('does not start recording a session that never was', async () => {
    await seedInterruptedSession({ wasTracking: false });
    const s = mount();
    await s.whenTraceReady();
    await flush();

    expect(s.gpsTracking).toBe(false);
    expect(s.autoResumed).toBe(false);
  });

  it('does not re-prompt when the permission has been refused', async () => {
    await seedInterruptedSession();
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: makePermissions('denied') });

    const s = mount();
    await s.whenTraceReady();
    await flush();

    expect(s.gpsTracking).toBe(false);
    expect(s.autoResumed).toBe(false);
    // Reported through the app's single geolocation wording helper
    // rather than left as an unexplained silence.
    expect(s.geoError).toEqual({ code: 1 });
  });

  it('still resumes on a browser that cannot answer the permission question', async () => {
    await seedInterruptedSession();
    // Safari throws on this descriptor. Treating "unknown" as "denied"
    // would cost auto-resume on an entire platform.
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });

    const s = mount();
    await s.whenTraceReady();
    await flush();

    expect(s.gpsTracking).toBe(true);
    expect(s.autoResumed).toBe(true);
  });

  it('does nothing when there is no session at all', async () => {
    const s = mount();
    await s.whenTraceReady();
    await flush();

    expect(s.sessionActive).toBe(false);
    expect(s.gpsTracking).toBe(false);
    expect(s.autoResumed).toBe(false);
  });
});

describe('the flag is cleared when the user takes charge', () => {
  it('clears on acknowledgement', async () => {
    await seedInterruptedSession();
    const s = mount();
    await s.whenTraceReady();
    await flush();

    s.dismissInterruption();
    expect(s.autoResumed).toBe(false);
    expect(s.keepAliveBlocked).toBe(false);
    // Acknowledging is not stopping.
    expect(s.gpsTracking).toBe(true);
  });

  it('clears when a new outing starts', async () => {
    await seedInterruptedSession();
    const s = mount();
    await s.whenTraceReady();
    await flush();

    s.start({ type: 'route', id: 9, lang: 'fr' }, { track: true });
    await flush();

    expect(s.autoResumed).toBe(false);
    expect(s.keepAliveBlocked).toBe(false);
  });
});

describe('the retry offered matches what the platform can do', () => {
  it('does not offer to restart an audio keep-alive that does not exist on Apple', async () => {
    // navigator.standalone existing at all is what marks WebKit on
    // iOS/iPadOS, where the silent clip is deliberately never started.
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    await seedInterruptedSession();

    const s = mount();
    await s.whenTraceReady();
    await flush();

    expect(s.platform.usesBackgroundAudio).toBe(false);
    expect(s.autoResumed).toBe(true);
    // Raising the flag here would put up a "touchez ici" button whose
    // handler returns false every time — worse than no button. The UI
    // points at the screen-on hold instead.
    expect(s.keepAliveBlocked).toBe(false);

    delete navigator.standalone;
  });
});

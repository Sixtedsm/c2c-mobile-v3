// The trace has to survive the phone.
//
// It used to be a single JSON blob in localStorage, rewritten whole
// every few seconds, under a ~5 MB origin quota shared with the auth
// token and Yeti's imported courses — and every write failure was
// swallowed. Once the quota was reached nothing was durable any more and
// nothing said so, which is the same silence every field report has had.
//
// These are the first tests in the suite to assert `positions` after a
// remount. Because hydration is now asynchronous, they must await
// whenTraceReady() — the older suites assert only scalars, which is why
// they still hold unchanged.

import Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real IndexedDB behaviour (fake-indexeddb via tests/setup.js), with a
// switch the test can flip to make the store refuse a write.
let failWrite = null;

vi.mock('idb-keyval', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    setMany: vi.fn(async (entries) => {
      if (failWrite) throw failWrite;
      return actual.setMany(entries);
    }),
  };
});

import { clear } from 'idb-keyval';

import install from '@/js/vue-plugins/outing-session';
import { loadTrace } from '@/pwa/trace-store';

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

// Walk a leg: `count` fixes, ~11 m and 6 s apart, which clears both the
// sampler throttle and the recorder's step floor.
function walk(session, count, startIndex = 0) {
  for (let i = 0; i < count; i++) {
    const n = startIndex + i;
    geo.fire(45.9 + n * 0.0001, 6.86, BASE + n * 6000);
  }
  return session;
}

beforeEach(async () => {
  failWrite = null;
  window.localStorage.clear();
  await clear();
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

describe('a recorded trace survives a reload', () => {
  it('comes back from IndexedDB, in order and complete', async () => {
    const first = mount();
    first.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(first, 40);
    await flush();
    await first.flushTrace();

    const recorded = first.positions.length;
    expect(recorded).toBeGreaterThan(30);

    // The phone kills the tab; the user opens the app again.
    const revived = mount();
    await revived.whenTraceReady();
    await flush();

    expect(revived.positions).toHaveLength(recorded);
    expect(revived.positions.map((p) => p.t)).toEqual(first.positions.map((p) => p.t));
    expect(revived.sessionActive).toBe(true);
  });

  it('restores the published figures with it', async () => {
    // The totals stopped being a computed and became a snapshot fed
    // point by point. A revived session gets its trace in one assignment
    // and no watcher fires for it, so something has to recompute — or a
    // reload would show 0 km and, worse, publish it.
    const first = mount();
    first.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(first, 60);
    await flush();
    await first.flushTrace();
    const distance = first.tracedDistanceMeters;
    expect(distance).toBeGreaterThan(100);

    const revived = mount();
    await revived.whenTraceReady();
    await flush();

    expect(revived.tracedDistanceMeters).toBeCloseTo(distance, 5);
  });

  it('keeps the trace out of the localStorage blob', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(s, 40);
    await flush();

    const blob = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(blob.positions).toBeUndefined();
    expect(blob.schema).toBe(2);
    expect(blob.traceId).toBeTruthy();
    // Metadata only: a few hundred bytes whatever the outing's length.
    expect(window.localStorage.getItem(STORAGE_KEY).length).toBeLessThan(600);
  });
});

describe('migration from the old single-blob format', () => {
  it('moves an in-progress trace into IndexedDB without losing a point', async () => {
    const legacy = {
      // No `schema` key — that is what a build before this change wrote.
      sessionActive: true,
      gpsTracking: false,
      wasTracking: true,
      topoRef: { type: 'route', id: 7, lang: 'fr' },
      startedAt: Date.now() - 3600_000,
      paused: false,
      pausedAt: null,
      pausedMs: 0,
      positions: Array.from({ length: 130 }, (_, i) => ({
        lat: 45.9 + i * 0.0001,
        lon: 6.86,
        alt: 1000 + i,
        accuracy: 5,
        t: BASE + i * 5000,
      })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const s = mount();
    // Available synchronously, before any await: an old session must
    // never have a window where its trace is missing.
    expect(s.positions).toHaveLength(130);

    await s.whenTraceReady();
    await flush();

    expect(s.legacyTrace).toBe(false);
    expect(s.traceId).toBeTruthy();
    expect(await loadTrace(s.traceId)).toHaveLength(130);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).positions).toBeUndefined();
  });

  it('keeps carrying the trace in the blob when the move fails', async () => {
    const legacy = {
      sessionActive: true,
      wasTracking: true,
      topoRef: { type: 'route', id: 7, lang: 'fr' },
      startedAt: Date.now() - 600_000,
      paused: false,
      pausedMs: 0,
      positions: Array.from({ length: 40 }, (_, i) => ({ lat: 45 + i * 1e-4, lon: 6, t: BASE + i * 5000 })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    failWrite = Object.assign(new Error('nope'), { name: 'QuotaExceededError' });

    const s = mount();
    await s.whenTraceReady();
    await flush();

    // Degrade to the old path rather than to no path: the trace is
    // still in memory, still in the blob, and the user is told why.
    expect(s.legacyTrace).toBe(true);
    expect(s.storageError).toBe('quota');
    expect(s.positions).toHaveLength(40);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).positions).toHaveLength(40);
  });
});

describe('a store that will not take the trace says so', () => {
  it('reports a full store and keeps the recording in memory', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(s, 40);
    await flush();

    failWrite = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    await s.flushTrace();

    expect(s.storageError).toBe('quota');
    // Nothing is lost yet — which is exactly why the UI offers a GPX
    // export at this point rather than a shrug.
    expect(s.positions.length).toBeGreaterThan(30);
  });

  it('clears the alert once a write gets through again', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(s, 20);
    await flush();

    failWrite = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    await s.flushTrace();
    expect(s.storageError).toBe('quota');

    failWrite = null;
    walk(s, 5, 20);
    await flush();
    await s.flushTrace();

    expect(s.storageError).toBe(null);
    expect(await loadTrace(s.traceId)).toHaveLength(s.positions.length);
  });
});

describe('a finished trace does not linger', () => {
  it('is deleted when the outing is stopped', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(s, 30);
    await flush();
    await s.flushTrace();
    const traceId = s.traceId;
    expect(await loadTrace(traceId)).not.toHaveLength(0);

    s.stop();
    await flush();

    expect(await loadTrace(traceId)).toEqual([]);
    // Still in memory: the user may yet export it or open the form.
    expect(s.positions.length).toBeGreaterThan(0);
  });

  it('is deleted when the user discards it', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(s, 30);
    await flush();
    await s.flushTrace();
    const traceId = s.traceId;

    s.discardTrace();
    await flush();

    expect(s.positions).toEqual([]);
    expect(await loadTrace(traceId)).toEqual([]);
    expect(s.tracedDistanceMeters).toBe(0);
  });

  it('does not let a new outing inherit the previous trace', async () => {
    const s = mount();
    s.start({ type: 'route', id: 1, lang: 'fr' }, { track: true });
    await flush();
    walk(s, 30);
    await flush();
    await s.flushTrace();
    const firstTraceId = s.traceId;

    s.start({ type: 'route', id: 2, lang: 'fr' }, { track: true });
    await flush();

    expect(s.traceId).not.toBe(firstTraceId);
    expect(s.positions).toEqual([]);

    const revived = mount();
    await revived.whenTraceReady();
    await flush();
    expect(revived.positions).toEqual([]);
  });
});

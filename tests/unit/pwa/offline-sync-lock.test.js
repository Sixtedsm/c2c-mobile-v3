// Regression guard for the two sync-queue defects found in the
// 2026-09-02 audit (C-2 and C-3). Both were silent: one published
// duplicate outings on the user's camptocamp.org account, the other
// wedged the queue for the rest of the session with no feedback.
//
// The plugin is a Vue instance built at install() time, so we mount it
// on a throwaway Vue constructor and stub the two collaborators it
// touches during a sync pass: the IndexedDB-backed store and the C2C
// outing API.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// c2c.outing.create is the network call the loop makes per queued item.
vi.mock('@/js/apis/c2c', () => ({
  default: {
    outing: { create: vi.fn(async () => ({ data: { document_id: 42 } })) },
    createImages: vi.fn(async () => ({ data: { images: [] } })),
  },
}));

// config.js reads CAMPTOCAMP_CONFIG, a webpack DefinePlugin global that
// only exists in a real build. Stub the two URLs the offline plugin
// actually touches (tile prefetch + image URLs).
vi.mock('@/js/config', () => ({
  default: { urls: { api: 'https://api.example.test', forum: 'https://forum.example.test' } },
}));

// bulma-toast renders into the DOM; we only care that it doesn't throw.
vi.mock('bulma-toast', () => ({ toast: vi.fn() }));

// Everything the sync path reads/writes on disk.
vi.mock('@/pwa/offline-store', () => ({
  listDocuments: vi.fn(async () => []),
  listFolders: vi.fn(async () => []),
  listPendingOutings: vi.fn(async () => []),
  replacePendingOutings: vi.fn(async () => {}),
  saveDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  saveFolder: vi.fn(async () => {}),
  deleteFolder: vi.fn(async () => {}),
  setDocumentFolder: vi.fn(async () => {}),
  getDocument: vi.fn(async () => null),
  estimateUsage: vi.fn(async () => ({})),
  enqueuePendingOuting: vi.fn(async () => ({})),
  removePendingOuting: vi.fn(async () => {}),
}));

import c2c from '@/js/apis/c2c';
import install from '@/js/vue-plugins/offline';
import * as store from '@/pwa/offline-store';

// One queued outing, shaped the way queueOuting() writes it.
const pendingItem = () => ({
  id: 'p1',
  payload: { locales: [{ title: 'Course test' }], associations: { users: [{ document_id: 7 }] } },
  photos: [],
  attempts: 0,
  conflict: false,
  needsRouteAssoc: false,
});

function mountPlugin() {
  const LocalVue = Vue.extend();
  LocalVue.prototype.$user = { id: 7 };
  install(LocalVue);
  const vm = LocalVue.prototype.$offline;
  vm.online = true;
  return vm;
}

describe('offline sync queue — re-entrancy lock (audit C-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.listPendingOutings.mockResolvedValue([]);
    store.replacePendingOutings.mockResolvedValue(undefined);
    c2c.outing.create.mockResolvedValue({ data: { document_id: 42 } });
  });

  it('publishes a queued outing exactly once when two callers race', async () => {
    // The real trigger: the `online` event handler firing at the same
    // moment the user taps "Synchroniser" in OfflineView.
    store.listPendingOutings.mockResolvedValue([pendingItem()]);
    const vm = mountPlugin();

    await Promise.all([vm.syncPendingOutings(), vm.syncPendingOutings()]);

    // Before the fix the lock was claimed after the first await, so both
    // callers read the same queue and POSTed it.
    expect(c2c.outing.create).toHaveBeenCalledTimes(1);
  });

  it('releases the lock so a later sync still runs', async () => {
    store.listPendingOutings.mockResolvedValue([pendingItem()]);
    const vm = mountPlugin();

    await vm.syncPendingOutings();
    expect(vm.syncing).toBe(false);

    await vm.syncPendingOutings();
    expect(c2c.outing.create).toHaveBeenCalledTimes(2);
  });
});

describe('offline sync queue — failure recovery (audit C-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.listPendingOutings.mockResolvedValue([]);
    store.replacePendingOutings.mockResolvedValue(undefined);
    c2c.outing.create.mockResolvedValue({ data: { document_id: 42 } });
  });

  it('does not wedge the queue when the final write throws', async () => {
    // Quota exceeded / private-mode Safari / store locked by another tab.
    store.listPendingOutings.mockResolvedValue([pendingItem()]);
    store.replacePendingOutings.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const vm = mountPlugin();

    // Must not reject at the call site — three of the four callers are
    // fire-and-forget and would raise an unhandled rejection.
    await expect(vm.syncPendingOutings()).resolves.toBeUndefined();

    // Before the fix `syncing` stayed true forever and every later sync
    // returned silently on the guard.
    expect(vm.syncing).toBe(false);

    store.replacePendingOutings.mockResolvedValue(undefined);
    await vm.syncPendingOutings();
    expect(c2c.outing.create).toHaveBeenCalledTimes(2);
  });

  it('does not wedge the queue when reading the queue throws', async () => {
    store.listPendingOutings.mockRejectedValueOnce(new Error('IDB unavailable'));
    const vm = mountPlugin();

    await expect(vm.syncPendingOutings()).resolves.toBeUndefined();
    expect(vm.syncing).toBe(false);
  });
});

// The retry cap (src/pwa/sync-policy.js) stops the queue from retrying a
// doomed outing on every reconnect. It also means an item can be frozen,
// and the state around that has to stay coherent — a frozen item the user
// cannot actually retry would be worse than the storm it replaced.
describe('freezing and un-freezing a queued outing', () => {
  it('freezes a permanently rejected outing instead of retrying it forever', async () => {
    store.listPendingOutings.mockResolvedValue([pendingItem()]);
    c2c.outing.create.mockRejectedValue({
      response: { status: 400, data: { errors: [{ name: 'activities', description: 'required' }] } },
    });

    const vm = mountPlugin();
    vm.online = true;
    await vm.syncPendingOutings();

    const [saved] = store.replacePendingOutings.mock.calls.at(-1);
    // A 400 will answer identically however many times it is sent.
    expect(saved[0].conflict).toBe(true);
    expect(saved[0].freezeReason).toBe('invalid');
    expect(saved[0].ambiguous).toBe(false);
  });

  it('flags a lost response as unknown rather than republishing blind', async () => {
    store.listPendingOutings.mockResolvedValue([{ ...pendingItem(), attempts: 2 }]);
    // No response at all: the server may have committed the outing.
    c2c.outing.create.mockRejectedValue(new Error('Network Error'));

    const vm = mountPlugin();
    vm.online = true;
    await vm.syncPendingOutings();

    const [saved] = store.replacePendingOutings.mock.calls.at(-1);
    expect(saved[0].conflict).toBe(true);
    expect(saved[0].ambiguous).toBe(true);
  });

  it('gives a retried outing its full budget back', async () => {
    // Without this the cap re-freezes the item on its first attempt and
    // "Réessayer" appears to do nothing at all.
    store.listPendingOutings.mockResolvedValue([
      { ...pendingItem(), attempts: 3, conflict: true, freezeReason: 'exhausted', ambiguous: true },
    ]);

    const vm = mountPlugin();
    vm.online = false; // no sync pass, just the state change
    await vm.retryConflictedOuting('p1');

    const [saved] = store.replacePendingOutings.mock.calls.at(-1);
    expect(saved[0].conflict).toBe(false);
    expect(saved[0].attempts).toBe(0);
    expect(saved[0].freezeReason).toBeNull();
    expect(saved[0].ambiguous).toBe(false);
  });
});

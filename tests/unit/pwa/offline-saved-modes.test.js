// "Saved" vs "offline" — the two ways a topo can live in Mes topos.
//
// Sixte, 2026-09-02: saving a topo used to always download the whole
// package (images + ~250 map tiles), which filled storage and made the
// offline-route picker on the outing form unusable. A plain save is now
// light by default and the full download is an explicit second step.
//
// The riskiest part of that change is not the new behaviour but the old
// data: every topo saved before this existed carries no `mode` and is in
// fact fully downloaded. Reading those as light saves would tell a user
// their topo is text-only when it is complete — right before they walk
// out of network coverage. The legacy test below guards exactly that.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/js/config', () => ({
  default: { urls: { api: 'https://api.example.test', forum: 'https://forum.example.test' } },
}));

vi.mock('bulma-toast', () => ({ toast: vi.fn() }));

// A topo document with one embedded image and a trace, so the heavy
// pipeline has something to chew on when it does run.
const cookedDoc = {
  document_id: 123,
  cooked: { description: '<img src="https://media.example.test/photo.jpg">' },
  associations: { images: [{ document_id: 9, filename: 'x.jpg' }] },
  geometry: {
    geom_detail: JSON.stringify({
      type: 'LineString',
      coordinates: [
        [700000, 5700000],
        [700100, 5700100],
      ],
    }),
  },
};

vi.mock('@/js/apis/c2c', () => ({
  default: {
    route: { getCooked: vi.fn(async () => ({ data: cookedDoc })) },
    image: { getCooked: vi.fn(async () => ({ data: { document_id: 9, filename: 'x.jpg' } })) },
    outing: { create: vi.fn(async () => ({ data: { document_id: 1 } })) },
    createImages: vi.fn(async () => ({ data: { images: [] } })),
  },
}));

import install from '@/js/vue-plugins/offline';
import * as store from '@/pwa/offline-store';

function mount() {
  const LocalVue = Vue.extend();
  LocalVue.prototype.$user = { id: 7 };
  install(LocalVue);
  const vm = LocalVue.prototype.$offline;
  vm.online = true;
  return vm;
}

// Every asset prefetch goes through window.fetch, so counting calls is a
// direct measure of "did we download the heavy package".
let fetchSpy;

beforeEach(async () => {
  vi.clearAllMocks();
  fetchSpy = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('fetch', fetchSpy);
  // Wipe IndexedDB between tests so entries do not leak across cases.
  for (const d of await store.listDocuments()) {
    await store.deleteDocument(d.type, d.id, d.lang);
  }
});

describe('saving is light by default', () => {
  it('stores the document without fetching any asset', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });

    const entries = await store.listDocuments();
    expect(entries).toHaveLength(1);
    expect(entries[0].mode).toBe(store.SAVED_MODE);
    // The text is still there — a light save is readable offline.
    expect(entries[0].data).toEqual(cookedDoc);
    // …but nothing heavy was pulled: no image, no map tile.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downloads the full package when offline mode is asked for', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });

    const entry = (await store.listDocuments()).find((e) => e.type === 'route');
    expect(entry.mode).toBe(store.OFFLINE_MODE);
    expect(entry.downloadedAt).toBeTruthy();
    // Embedded image + gallery variants + map tiles all go through fetch.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('legacy entries stay trustworthy', () => {
  it('reads a pre-mode entry as fully downloaded, never as a light save', async () => {
    // Exactly what the store wrote before modes existed.
    const { set } = await import('idb-keyval');
    await set('doc:route/999/fr', {
      type: 'route',
      id: 999,
      lang: 'fr',
      data: cookedDoc,
      folderId: null,
      savedAt: Date.now(),
    });

    const entries = await store.listDocuments();
    const legacy = entries.find((e) => String(e.id) === '999');
    expect(legacy.mode).toBe(store.OFFLINE_MODE);

    const vm = mount();
    await vm.refresh();
    // The promise the user relies on in the field must hold.
    expect(vm.isOfflineReady('route', 999, 'fr')).toBe(true);
  });
});

describe('the outing form only offers mountain-ready topos', () => {
  it('keeps light saves out of offlineDocs', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });
    await vm.refresh();

    expect(vm.savedDocs).toHaveLength(1);
    expect(vm.offlineDocs).toHaveLength(0);
    expect(vm.savedOnlyDocs).toHaveLength(1);
    expect(vm.isSaved('route', 123, 'fr')).toBe(true);
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(false);
  });
});

describe('a refresh must not silently demote a downloaded topo', () => {
  it('keeps offline mode when re-saving an already downloaded entry', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });
    await vm.refresh();
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(true);

    // What OfflineView's "rafraîchir" button does. Because saveDocument
    // now defaults to a light save, omitting the mode here would strip
    // the images and the map from a topo the user believes is ready —
    // and they would only find out with no signal.
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: 'offline' });
    await vm.refresh();

    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(true);
  });
});

describe('promoting and demoting', () => {
  it('downloadForOffline turns a light save into a full package', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });
    await vm.refresh();
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(false);

    await vm.downloadForOffline('route', 123, 'fr');
    await vm.refresh();

    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(true);
    expect(vm.offlineDocs).toHaveLength(1);
  });

  it('downloadForOffline keeps the topo in its folder', async () => {
    const vm = mount();
    const folderId = await vm.createFolder('Projets 2026');
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', folderId });
    await vm.refresh();

    await vm.downloadForOffline('route', 123, 'fr');
    await vm.refresh();

    const entry = vm.savedDocs.find((e) => e.type === 'route');
    expect(entry.folderId).toBe(folderId);
  });

  it('removeOfflineData demotes without losing the topo or its text', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });
    await vm.refresh();

    await vm.removeOfflineData('route', 123, 'fr');
    await vm.refresh();

    expect(vm.isSaved('route', 123, 'fr')).toBe(true);
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(false);
    // Demoting must not throw the document away — the entry is still
    // readable as text and still filed where the user put it.
    expect(await vm.getDocument('route', 123, 'fr')).toEqual(cookedDoc);
  });
});

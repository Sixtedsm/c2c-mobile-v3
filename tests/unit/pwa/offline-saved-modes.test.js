// "En ligne" vs "hors ligne" — the two halves of Mes topos.
//
// Sixte, 2026-09-02: saving a topo used to always download the whole
// package (images + ~250 map tiles), which filled storage and made the
// offline-route picker on the outing form unusable. Saving is now a
// bookmark and the download is an explicit second step.
//
// The distinction is only worth anything if it is absolute, so two
// invariants are load-bearing here and both are tested below:
//
//   1. An online entry keeps NO document. The message shown at save time
//      promises one thing — "ce topo ne sera pas accessible hors ligne" —
//      and a stored payload would quietly make that false.
//   2. Legacy rows stay trustworthy. Every topo saved before modes
//      existed carries no `mode` and is in fact fully downloaded.
//      Reading those as bookmarks would tell a user their topo is
//      unavailable right before they walk out of network coverage.
//
// Folders are per-section, so a topo changing side arrives unfiled.

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
  cooked: { title: 'Voie normale', description: '<img src="https://media.example.test/photo.jpg">' },
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
  for (const f of await store.listFolders()) {
    await store.deleteFolder(f.id);
  }
});

describe('saving puts a topo online, not offline', () => {
  it('stores no document and fetches no asset', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });

    const entries = await store.listDocuments();
    expect(entries).toHaveLength(1);
    expect(entries[0].mode).toBe(store.ONLINE_MODE);
    // The whole promise of the save-time message. Keeping the payload
    // would leave the topo half-readable with no network, which is the
    // ambiguity the two sections exist to remove.
    expect(entries[0].data).toBeFalsy();
    expect(await vm.getDocument('route', 123, 'fr')).toBeNull();
    // …and nothing heavy was pulled: no image, no map tile.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps enough metadata to draw the card', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });

    const entry = (await store.listDocuments())[0];
    // Without this the entry has no document and no descriptor, so its
    // row in Mes topos degrades to "Sans titre".
    expect(entry.meta.title).toBe('Voie normale');
  });

  it('downloads the full package when offline mode is asked for', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });

    const entry = (await store.listDocuments()).find((e) => e.type === 'route');
    expect(entry.mode).toBe(store.OFFLINE_MODE);
    expect(entry.downloadedAt).toBeTruthy();
    expect(entry.data).toEqual(cookedDoc);
    // Embedded image + gallery variants + map tiles all go through fetch.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('legacy entries stay trustworthy', () => {
  it('reads a pre-mode entry as fully downloaded, never as a bookmark', async () => {
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
    expect(await vm.getDocument('route', 999, 'fr')).toEqual(cookedDoc);
  });

  it('reads the short-lived saved mode as online', async () => {
    const { set } = await import('idb-keyval');
    await set('doc:route/998/fr', {
      type: 'route',
      id: 998,
      lang: 'fr',
      data: cookedDoc,
      folderId: null,
      mode: 'saved',
      savedAt: Date.now(),
    });

    const entry = (await store.listDocuments()).find((e) => String(e.id) === '998');
    expect(entry.mode).toBe(store.ONLINE_MODE);
    // Even though the row still carries a payload, an online entry must
    // not serve one — otherwise one topo behaves unlike its neighbour.
    expect(await store.getDocument('route', 998, 'fr')).toBeNull();
  });

  it('files a folder created before sections existed on the offline side', async () => {
    const { set } = await import('idb-keyval');
    await set('folder:legacy1', { id: 'legacy1', name: 'Chartreuse', createdAt: Date.now() });

    const folders = await store.listFolders();
    // Back then everything in a folder was downloaded, so that is where
    // those folders belong.
    expect(folders.find((f) => f.id === 'legacy1').section).toBe(store.OFFLINE_MODE);
  });
});

describe('the outing form only offers mountain-ready topos', () => {
  it('keeps online saves out of offlineDocs', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });
    await vm.refresh();

    expect(vm.savedDocs).toHaveLength(1);
    expect(vm.offlineDocs).toHaveLength(0);
    expect(vm.onlineDocs).toHaveLength(1);
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
    // defaults to an online save, omitting the mode here would strip the
    // images and the map from a topo the user believes is ready — and
    // they would only find out with no signal.
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });
    await vm.refresh();

    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(true);
  });
});

describe('promoting and demoting', () => {
  it('downloadForOffline turns an online save into a full package', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });
    await vm.refresh();
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(false);

    await vm.downloadForOffline('route', 123, 'fr');
    await vm.refresh();

    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(true);
    expect(vm.offlineDocs).toHaveLength(1);
    // The payload only exists once the topo is genuinely downloaded.
    expect(await vm.getDocument('route', 123, 'fr')).toEqual(cookedDoc);
  });

  it('downloadForOffline drops the online folder — the sections are separate', async () => {
    const vm = mount();
    const folderId = await vm.createFolder('Préparation sortie du 12', store.ONLINE_MODE);
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', folderId });
    await vm.refresh();

    await vm.downloadForOffline('route', 123, 'fr');
    await vm.refresh();

    // Carrying the id over would file the topo under a folder the offline
    // section does not display, so it would vanish from both lists.
    expect(vm.savedDocs.find((e) => e.type === 'route').folderId).toBeNull();
  });

  it('removeOfflineData sends the topo back online, unfiled and unreadable', async () => {
    const vm = mount();
    const folderId = await vm.createFolder('Voyage en Argentine', store.OFFLINE_MODE);
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', folderId, mode: store.OFFLINE_MODE });
    await vm.refresh();

    await vm.removeOfflineData('route', 123, 'fr');
    await vm.refresh();

    expect(vm.isSaved('route', 123, 'fr')).toBe(true);
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(false);
    // Demoting drops the payload: the topo is now exactly as available as
    // any other online entry, which is what its section claims.
    expect(await vm.getDocument('route', 123, 'fr')).toBeNull();
    expect(vm.savedDocs.find((e) => e.type === 'route').folderId).toBeNull();
    // …but the card still has a title.
    expect(vm.savedDocs.find((e) => e.type === 'route').meta.title).toBe('Voie normale');
  });
});

describe('folders belong to one section', () => {
  it('never shows a folder on the other side', async () => {
    const vm = mount();
    const onlineId = await vm.createFolder('Mes sorties favorites', store.ONLINE_MODE);
    const offlineId = await vm.createFolder('Voyage en Argentine', store.OFFLINE_MODE);
    await vm.refresh();

    expect(vm.foldersInSection(store.ONLINE_MODE).map((f) => f.id)).toEqual([onlineId]);
    expect(vm.foldersInSection(store.OFFLINE_MODE).map((f) => f.id)).toEqual([offlineId]);
  });

  it('keeps a folder in its section when renamed', async () => {
    const vm = mount();
    const id = await vm.createFolder('Brouillon', store.ONLINE_MODE);
    await vm.renameFolder(id, 'Préparation sortie du 12, 13, 14');
    await vm.refresh();

    const folder = vm.foldersInSection(store.ONLINE_MODE).find((f) => f.id === id);
    expect(folder.name).toBe('Préparation sortie du 12, 13, 14');
    expect(vm.foldersInSection(store.OFFLINE_MODE)).toHaveLength(0);
  });
});

describe('emptying one section leaves the other alone', () => {
  it('purges only the section it was given', async () => {
    const vm = mount();
    await vm.createFolder('Dossier en ligne', store.ONLINE_MODE);
    await vm.createFolder('Dossier hors ligne', store.OFFLINE_MODE);
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });
    await vm.saveDocument({ type: 'route', id: 456, lang: 'fr', mode: store.OFFLINE_MODE });
    await vm.refresh();
    expect(vm.savedDocs).toHaveLength(2);

    // "Tout vider" sits under a tab, so it must not touch the list the
    // user cannot see.
    await vm.purgeAllDocuments(store.ONLINE_MODE);

    expect(vm.onlineDocs).toHaveLength(0);
    expect(vm.offlineDocs).toHaveLength(1);
    expect(vm.foldersInSection(store.ONLINE_MODE)).toHaveLength(0);
    expect(vm.foldersInSection(store.OFFLINE_MODE)).toHaveLength(1);
  });
});

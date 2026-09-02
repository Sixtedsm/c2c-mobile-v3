// "Si le téléchargement est incomplet" — CDC §2.2.
//
// Freshness badges already answer "is this copy old". They cannot answer
// this one: a package downloaded five minutes ago inside a tunnel is
// fresh and incomplete at the same time. Nothing used to track the
// difference — every asset failure was swallowed by prefetchUrl — so a
// half-downloaded topo looked exactly like a complete one, right up to
// the moment someone opened it with no signal.
//
// Two failure shapes are covered here, and they are not the same:
//   - assets that failed while the app kept running;
//   - a download that never finished at all, because the tab was killed
//     or the phone went into a tunnel. That one leaves no failures to
//     count, only an entry that was never closed.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/js/config', () => ({
  default: { urls: { api: 'https://api.example.test', forum: 'https://forum.example.test' } },
}));

vi.mock('bulma-toast', () => ({ toast: vi.fn() }));

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

// Let the background tile pass settle — it deliberately runs after
// saveDocument returns, and it is what closes the download.
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  await Vue.nextTick();
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

beforeEach(async () => {
  vi.clearAllMocks();
  for (const d of await store.listDocuments()) {
    await store.deleteDocument(d.type, d.id, d.lang);
  }
});

async function entry() {
  return (await store.listDocuments()).find((e) => e.type === 'route');
}

describe('a complete download is recorded as complete', () => {
  it('closes the entry once every asset landed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    );
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });
    await settle();

    const e = await entry();
    expect(e.assets.done).toBe(true);
    expect(e.assets.failed).toBe(0);
    expect(e.assets.attempted).toBeGreaterThan(0);
    expect(store.isDownloadComplete(e)).toBe(true);
  });
});

describe('a partial download is visible', () => {
  it('counts the assets that did not make it', async () => {
    // Network drops after the first few requests — the tunnel case.
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls > 2) throw new Error('network down');
        return { ok: true };
      })
    );
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });
    await settle();

    const e = await entry();
    expect(e.assets.failed).toBeGreaterThan(0);
    // The document itself is still there and still worth having — the
    // topo is saved, it is just not the full package.
    expect(store.isDownloadComplete(e)).toBe(false);
    expect(e.data).toEqual(cookedDoc);
    expect(vm.isOfflineReady('route', 123, 'fr')).toBe(true);
  });
});

describe('an interrupted download does not pass for a complete one', () => {
  it('leaves the entry open when the tiles never finish', async () => {
    // Tiles that never answer — the phone entering a tunnel, or the tab
    // being killed, with requests still in flight.
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (/\/\d+\/\d+\/\d+\.png/.test(String(url))) {
          return new Promise(() => {});
        }
        return Promise.resolve({ ok: true });
      })
    );
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr', mode: store.OFFLINE_MODE });
    await settle();
    // Nothing failed and nothing finished: the entry is simply still open.
    const e = await entry();
    expect(e.assets.done).toBe(false);
    expect(store.isDownloadComplete(e)).toBe(false);
  });
});

describe('what we cannot judge, we do not flag', () => {
  it('treats a topo saved before this existed as complete', async () => {
    const { set } = await import('idb-keyval');
    await set('doc:route/999/fr', {
      type: 'route',
      id: 999,
      lang: 'fr',
      data: cookedDoc,
      folderId: null,
      mode: 'offline',
      savedAt: Date.now(),
    });

    // No `assets` field at all. Warning someone about a topo that is
    // most likely fine is its own kind of failure.
    const legacy = (await store.listDocuments()).find((e) => String(e.id) === '999');
    expect(legacy.assets).toBeUndefined();
    expect(store.isDownloadComplete(legacy)).toBe(true);
  });

  it('never flags an online entry, which downloaded nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    );
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });
    await settle();

    expect(store.isDownloadComplete(await entry())).toBe(true);
  });
});

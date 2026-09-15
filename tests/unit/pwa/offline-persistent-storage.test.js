// Asking the browser not to evict what the user carries offline.
//
// Storage is "best-effort" by default: Safari and Chrome may empty it
// under storage pressure, and WebKit only excludes an origin from eviction
// when it is in persistent mode (WebKit, "Updates to Storage Policy").
// The app asked for that mode only when a GPS recording started, so an
// outing written up by hand without a network — photos included — and
// every topo downloaded for the mountain sat in an evictable bucket.
// Raised on the forum by edwardoo, 2026-09-15.
//
// The request is advisory and never awaited; these tests only hold that
// it is made from the saves that put irreplaceable data on the phone, and
// not from a plain bookmark, where Firefox would prompt for nothing.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/js/config', () => ({
  default: { urls: { api: 'https://api.example.test', forum: 'https://forum.example.test' } },
}));

vi.mock('bulma-toast', () => ({ toast: vi.fn() }));

vi.mock('@/pwa/trace-store', () => ({ requestPersistentStorage: vi.fn(async () => true) }));

const cookedDoc = {
  document_id: 123,
  cooked: { title: 'Voie normale', description: '' },
  associations: { images: [] },
  geometry: { geom_detail: null },
};

vi.mock('@/js/apis/c2c', () => ({
  default: {
    route: { getCooked: vi.fn(async () => ({ data: cookedDoc })) },
    outing: { create: vi.fn(async () => ({ data: { document_id: 1 } })) },
    createImages: vi.fn(async () => ({ data: { images: [] } })),
  },
}));

import install from '@/js/vue-plugins/offline';
import * as store from '@/pwa/offline-store';
import { requestPersistentStorage } from '@/pwa/trace-store';

function mount() {
  const LocalVue = Vue.extend();
  LocalVue.prototype.$user = { id: 7 };
  install(LocalVue);
  const vm = LocalVue.prototype.$offline;
  vm.online = true;
  return vm;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true }))
  );
  for (const d of await store.listDocuments()) {
    await store.deleteDocument(d.type, d.id, d.lang);
  }
  await store.replacePendingOutings([]);
});

describe('persistent storage', () => {
  it('is requested when an outing is kept on the phone', async () => {
    const vm = mount();
    await vm.queueOuting({ locales: [{ lang: 'fr', title: 'Sortie hors ligne' }], associations: { routes: [] } });

    expect(requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it('is requested when a topo is downloaded for offline use', async () => {
    const vm = mount();
    await vm.downloadForOffline('route', 123, 'fr');

    expect(requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it('is not requested for a topo only bookmarked online', async () => {
    const vm = mount();
    await vm.saveDocument({ type: 'route', id: 123, lang: 'fr' });

    expect(requestPersistentStorage).not.toHaveBeenCalled();
  });
});

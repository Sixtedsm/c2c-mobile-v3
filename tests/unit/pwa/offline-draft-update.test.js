// Editing an outing that is still waiting to be published.
//
// The way the moderator works with trip reports: save the outing locally
// the moment it ends, fill it in on the way home, publish when ready.
// The queue could store an outing and publish it, but nothing could
// change it in between: editing meant re-saving, and re-saving created a
// second queued outing next to the first — two publishes of one outing.
//
// updatePendingOuting changes an item in place. These tests hold the
// three properties that make it safe: it never creates an item, it never
// resurrects one that was published meanwhile, and it goes through the
// same lock as the sync pass.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/js/apis/c2c', () => ({
  default: {
    outing: { create: vi.fn(async () => ({ data: { document_id: 42 } })) },
    createImages: vi.fn(async () => ({ data: { images: [] } })),
  },
}));

vi.mock('@/js/config', () => ({
  default: { urls: { api: 'https://api.example.test', forum: 'https://forum.example.test' } },
}));

vi.mock('bulma-toast', () => ({ toast: vi.fn() }));

vi.mock('@/pwa/api-access', () => ({ probeApiAccess: vi.fn(async () => 'ok') }));

let disk = [];
vi.mock('@/pwa/offline-store', () => ({
  listDocuments: vi.fn(async () => []),
  listFolders: vi.fn(async () => []),
  listPendingOutings: vi.fn(async () => disk.map((item) => ({ ...item }))),
  replacePendingOutings: vi.fn(async (queue) => {
    disk = queue.map((item) => ({ ...item }));
  }),
  enqueuePendingOuting: vi.fn(async (entry) => {
    const item = { id: 'p' + (disk.length + 1), queuedAt: 1, attempts: 0, ...entry };
    disk.push(item);
    return item;
  }),
  removePendingOuting: vi.fn(async (id) => {
    disk = disk.filter((item) => item.id !== id);
  }),
  saveDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  saveFolder: vi.fn(async () => {}),
  deleteFolder: vi.fn(async () => {}),
  setDocumentFolder: vi.fn(async () => {}),
  getDocument: vi.fn(async () => null),
  estimateUsage: vi.fn(async () => ({})),
}));

import c2c from '@/js/apis/c2c';
import install from '@/js/vue-plugins/offline';

function mountPlugin() {
  const LocalVue = Vue.extend();
  LocalVue.prototype.$user = { id: 7 };
  install(LocalVue);
  const vm = LocalVue.prototype.$offline;
  vm.online = true;
  return vm;
}

const outing = (title, extra = {}) => ({
  locales: [{ lang: 'fr', title }],
  activities: ['hiking'],
  associations: { users: [{ document_id: 7 }], routes: [] },
  geometry: { geom: null, geom_detail: '{"type":"LineString","coordinates":[[0,0],[1,1]]}' },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  disk = [];
});

describe('updatePendingOuting', () => {
  it('changes the queued outing in place, without creating a second one', async () => {
    const vm = mountPlugin();
    const queued = await vm.queueOuting(outing('Brouillon'));

    const updated = await vm.updatePendingOuting(queued.id, outing('Titre final', { description: 'Récit' }));

    expect(disk).toHaveLength(1);
    expect(disk[0].id).toBe(queued.id);
    expect(disk[0].payload.locales[0].title).toBe('Titre final');
    // The list card reads the title from the item, not the payload.
    expect(disk[0].title).toBe('Titre final');
    expect(updated.id).toBe(queued.id);
    expect(vm.pendingOutings).toHaveLength(1);
  });

  it('keeps what the user did not edit: queue time, photos and the recorded trace', async () => {
    const vm = mountPlugin();
    const queued = await vm.queueOuting(outing('Brouillon'), { photos: ['blob-a'] });

    await vm.updatePendingOuting(queued.id, outing('Titre final'));

    expect(disk[0].queuedAt).toBe(queued.queuedAt);
    expect(disk[0].photos).toEqual(['blob-a']);
    expect(disk[0].payload.geometry.geom_detail).toMatch(/LineString/);
  });

  it('does not resurrect an outing that was published in the meantime', async () => {
    const vm = mountPlugin();
    const queued = await vm.queueOuting(outing('Brouillon'));
    // The sync pass published it while the form was open.
    await vm.syncPendingOutings();
    expect(c2c.outing.create).toHaveBeenCalledTimes(1);
    expect(disk).toHaveLength(0);

    const updated = await vm.updatePendingOuting(queued.id, outing('Trop tard'));

    expect(updated).toBe(null);
    expect(disk).toHaveLength(0);
  });

  it('clears the "itinéraire à renseigner" hold once the edit adds a route', async () => {
    const vm = mountPlugin();
    const queued = await vm.queueOuting(outing('Sans itinéraire'), { needsRouteAssoc: true, routeNote: 'Face N' });

    await vm.updatePendingOuting(queued.id, outing('Sans itinéraire'));
    expect(disk[0].needsRouteAssoc).toBe(true);

    await vm.updatePendingOuting(
      queued.id,
      outing('Avec itinéraire', { associations: { users: [{ document_id: 7 }], routes: [{ document_id: 5 }] } })
    );
    expect(disk[0].needsRouteAssoc).toBe(false);
  });

  it('keeps a frozen item frozen: editing is not the same decision as retrying', async () => {
    const vm = mountPlugin();
    const queued = await vm.queueOuting(outing('Brouillon'));
    disk[0] = { ...disk[0], conflict: true, freezeReason: 'exhausted', ambiguous: true };

    await vm.updatePendingOuting(queued.id, outing('Corrigé'));

    // An ambiguous item may already be on the site. Only "Réessayer",
    // which says so, may send it again.
    expect(disk[0].conflict).toBe(true);
    expect(disk[0].ambiguous).toBe(true);
    expect(disk[0].payload.locales[0].title).toBe('Corrigé');
  });

  it('leaves the other queued outings alone', async () => {
    const vm = mountPlugin();
    const a = await vm.queueOuting(outing('A'));
    await vm.queueOuting(outing('B'));

    await vm.updatePendingOuting(a.id, outing('A modifiée'));

    expect(disk.map((i) => i.title)).toEqual(['A modifiée', 'B']);
  });
});

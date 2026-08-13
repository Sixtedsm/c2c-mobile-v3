import { clear } from 'idb-keyval';
import { beforeEach, describe, it, expect } from 'vitest';

import * as store from '@/pwa/offline-store';

beforeEach(async () => {
  await clear();
});

describe('offline-store — documents + folders', () => {
  it('round-trips a saved document', async () => {
    await store.saveDocument({
      type: 'route',
      id: 42,
      lang: 'fr',
      data: { title: 'Mont Blanc' },
    });
    const list = await store.listDocuments();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(42);
    expect(list[0].data.title).toBe('Mont Blanc');
    expect(list[0].folderId).toBeNull();
  });

  it('reassigns docs to null folder when deleteFolder is called', async () => {
    // Put a route into a folder, then drop the folder. The route must
    // survive with folderId=null so it's still reachable from the UI.
    await store.saveFolder({ id: 'f1', name: 'Weekend' });
    await store.saveDocument({
      type: 'route',
      id: 1,
      lang: 'fr',
      data: { title: 'Doc A' },
      folderId: 'f1',
    });
    await store.saveDocument({
      type: 'route',
      id: 2,
      lang: 'fr',
      data: { title: 'Doc B' },
      folderId: 'f1',
    });

    await store.deleteFolder('f1');

    const folders = await store.listFolders();
    expect(folders).toHaveLength(0);
    const docs = await store.listDocuments();
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.folderId === null)).toBe(true);
  });

  it('leaves docs in other folders untouched during deleteFolder', async () => {
    await store.saveFolder({ id: 'f1', name: 'A' });
    await store.saveFolder({ id: 'f2', name: 'B' });
    await store.saveDocument({ type: 'route', id: 1, lang: 'fr', data: {}, folderId: 'f1' });
    await store.saveDocument({ type: 'route', id: 2, lang: 'fr', data: {}, folderId: 'f2' });

    await store.deleteFolder('f1');

    const docs = await store.listDocuments();
    const doc2 = docs.find((d) => d.id === 2);
    expect(doc2.folderId).toBe('f2');
  });
});

describe('offline-store — pending outings queue', () => {
  it('normalizes legacy entries missing `attempts` on read', async () => {
    // Simulate a queue that predates the `attempts` field (shipped with a
    // migration on Sixte's 2026-06-24 changes). Consumers must be able
    // to do `item.attempts + 1` without defensive `|| 0`.
    const { set } = await import('idb-keyval');
    await set('queue:pending-outings', [
      { id: 'legacy_1', payload: {}, title: 'Old item' }, // no attempts field
      { id: 'new_1', payload: {}, title: 'New item', attempts: 3 },
    ]);
    const queue = await store.listPendingOutings();
    expect(queue).toHaveLength(2);
    expect(queue[0].attempts).toBe(0);
    expect(queue[1].attempts).toBe(3);
    expect(queue[0].id).toBe('legacy_1'); // migration doesn't reorder
  });

  it('appends new entries with attempts=0 and a queuedAt timestamp', async () => {
    const before = Date.now();
    await store.enqueuePendingOuting({ payload: { locales: [{ title: 't' }] } });
    const after = Date.now();

    const queue = await store.listPendingOutings();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(0);
    expect(queue[0].queuedAt).toBeGreaterThanOrEqual(before);
    expect(queue[0].queuedAt).toBeLessThanOrEqual(after);
  });

  it('removes a specific outing by id from the queue', async () => {
    const a = await store.enqueuePendingOuting({ payload: {} });
    await store.enqueuePendingOuting({ payload: {} });
    await store.removePendingOuting(a.id);
    const queue = await store.listPendingOutings();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).not.toBe(a.id);
  });
});

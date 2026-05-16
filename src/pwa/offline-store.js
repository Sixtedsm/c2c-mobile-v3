import { del, get, keys, set } from 'idb-keyval';

const docKey = (type, id, lang) => `doc:${type}/${id}/${lang}`;
const folderKey = (folderId) => `folder:${folderId}`;

const isDocKey = (key) => typeof key === 'string' && key.startsWith('doc:');
const isFolderKey = (key) => typeof key === 'string' && key.startsWith('folder:');

export async function saveDocument({ type, id, lang, data, folderId = null }) {
  await set(docKey(type, id, lang), {
    type,
    id,
    lang,
    data,
    folderId,
    savedAt: Date.now(),
  });
}

export async function getDocument(type, id, lang) {
  const entry = await get(docKey(type, id, lang));
  return entry?.data ?? null;
}

export async function hasDocument(type, id, lang) {
  return (await get(docKey(type, id, lang))) !== undefined;
}

export async function deleteDocument(type, id, lang) {
  await del(docKey(type, id, lang));
}

export async function listDocuments() {
  const allKeys = await keys();
  const docKeys = allKeys.filter(isDocKey);
  return Promise.all(docKeys.map((k) => get(k)));
}

export async function setDocumentFolder(type, id, lang, folderId) {
  const entry = await get(docKey(type, id, lang));
  if (!entry) {
    return;
  }
  entry.folderId = folderId;
  await set(docKey(type, id, lang), entry);
}

export async function saveFolder({ id, name }) {
  await set(folderKey(id), { id, name, createdAt: Date.now() });
}

export async function deleteFolder(folderId) {
  const allKeys = await keys();
  for (const key of allKeys) {
    if (!isDocKey(key)) {
      continue;
    }
    const entry = await get(key);
    if (entry?.folderId === folderId) {
      entry.folderId = null;
      await set(key, entry);
    }
  }
  await del(folderKey(folderId));
}

export async function listFolders() {
  const allKeys = await keys();
  const folderKeys = allKeys.filter(isFolderKey);
  return Promise.all(folderKeys.map((k) => get(k)));
}

export async function estimateUsage() {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}

const PENDING_OUTINGS_KEY = 'queue:pending-outings';

export async function listPendingOutings() {
  return (await get(PENDING_OUTINGS_KEY)) ?? [];
}

export async function enqueuePendingOuting(entry) {
  const queue = await listPendingOutings();
  queue.push({
    id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
    attempts: 0,
    ...entry,
  });
  await set(PENDING_OUTINGS_KEY, queue);
  return queue[queue.length - 1];
}

export async function replacePendingOutings(queue) {
  await set(PENDING_OUTINGS_KEY, queue);
}

export async function removePendingOuting(id) {
  const queue = await listPendingOutings();
  await set(
    PENDING_OUTINGS_KEY,
    queue.filter((item) => item.id !== id)
  );
}

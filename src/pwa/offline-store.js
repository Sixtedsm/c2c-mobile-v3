import { del, get, keys, set } from 'idb-keyval';

const docKey = (type, id, lang) => `doc:${type}/${id}/${lang}`;
const folderKey = (folderId) => `folder:${folderId}`;

const isDocKey = (key) => typeof key === 'string' && key.startsWith('doc:');
const isFolderKey = (key) => typeof key === 'string' && key.startsWith('folder:');

// Two kinds of saved entry:
//   'saved'   — the document JSON only. Light (tens of KB), readable
//               offline as text, but no images and no map tiles.
//   'offline' — the full package: JSON + embedded images + gallery
//               variants + surrounding map tiles. Megabytes, and what
//               you actually want in your pocket on the mountain.
// Entries written before this distinction existed carry no `mode` and
// were always fully downloaded, so listDocuments() reads them as
// 'offline'. Never default a missing mode to 'saved': that would tell
// a user their topo is text-only when it is in fact complete.
export const SAVED_MODE = 'saved';
export const OFFLINE_MODE = 'offline';

export async function saveDocument({ type, id, lang, data, folderId = null, mode = OFFLINE_MODE }) {
  const previous = await get(docKey(type, id, lang));
  await set(docKey(type, id, lang), {
    type,
    id,
    lang,
    data,
    folderId,
    mode,
    savedAt: previous?.savedAt ?? Date.now(),
    // Only a full download refreshes this. It is what the freshness
    // badge reads, and a light save must not make a stale package
    // look freshly downloaded.
    downloadedAt: mode === OFFLINE_MODE ? Date.now() : previous?.downloadedAt ?? null,
  });
}

// Flip an entry between the two modes without touching its payload or
// its folder. Returns false when the document is not saved at all.
export async function setDocumentMode(type, id, lang, mode) {
  const entry = await get(docKey(type, id, lang));
  if (!entry) return false;
  entry.mode = mode;
  if (mode === OFFLINE_MODE) entry.downloadedAt = Date.now();
  await set(docKey(type, id, lang), entry);
  return true;
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
  const entries = await Promise.all(docKeys.map((k) => get(k)));
  // Normalise legacy entries in one place so no consumer has to guess.
  return entries.filter(Boolean).map((e) => (e.mode ? e : { ...e, mode: OFFLINE_MODE }));
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
  const queue = (await get(PENDING_OUTINGS_KEY)) ?? [];
  // Normalize legacy entries that pre-date the `attempts` field — so
  // consumers can freely do `item.attempts + 1` without defensive `|| 0`.
  return queue.map((item) => (item.attempts === undefined || item.attempts === null ? { ...item, attempts: 0 } : item));
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

import { del, get, keys, set } from 'idb-keyval';

const docKey = (type, id, lang) => `doc:${type}/${id}/${lang}`;
const folderKey = (folderId) => `folder:${folderId}`;

const isDocKey = (key) => typeof key === 'string' && key.startsWith('doc:');
const isFolderKey = (key) => typeof key === 'string' && key.startsWith('folder:');

// A saved topo is in exactly one of two states, and the whole point of
// the split is that the difference is unambiguous:
//
//   'online'  — a bookmark. Only the slim descriptor needed to draw its
//               card is kept; opening the topo needs the network.
//   'offline' — the full package: document + embedded images + gallery
//               variants + surrounding map tiles. Megabytes, and what
//               you actually want in your pocket on the mountain.
//
// Stored values are migrated on read, in listDocuments():
//   - no mode at all → 'offline'. Those pre-date the split and were
//     always fully downloaded; reading them as bookmarks would tell a
//     user their topo is unavailable when it is in fact complete.
//   - 'saved' → 'online'. Short-lived intermediate name, same meaning.
export const ONLINE_MODE = 'online';
export const OFFLINE_MODE = 'offline';
const LEGACY_SAVED_MODE = 'saved';

// Internal. The service worker needs the same rule but asks for it through
// isOfflineEntry() below, so this stays private and there is exactly one
// place where a stored mode is interpreted.
function normaliseMode(mode) {
  if (!mode) {
    return OFFLINE_MODE;
  }
  return mode === LEGACY_SAVED_MODE ? ONLINE_MODE : mode;
}

// The single answer to "may this entry be served with no network?".
// Both readers ask it: getDocument() below, and the SW's document route.
export function isOfflineEntry(entry) {
  return Boolean(entry?.data) && normaliseMode(entry.mode) === OFFLINE_MODE;
}

export async function saveDocument({ type, id, lang, data, meta = null, folderId = null, mode = OFFLINE_MODE }) {
  const previous = await get(docKey(type, id, lang));
  const isOffline = mode === OFFLINE_MODE;
  await set(docKey(type, id, lang), {
    type,
    id,
    lang,
    // An online entry stores no document. Keeping one would leave the
    // topo partly readable without a network, which is precisely the
    // ambiguity the two states exist to remove.
    data: isOffline ? data : null,
    // …but its card still has to render with no network, so a slim
    // descriptor travels separately from the content it describes.
    meta: meta ?? previous?.meta ?? null,
    folderId,
    mode,
    savedAt: previous?.savedAt ?? Date.now(),
    // Only a full download refreshes this. It is what the freshness
    // badge reads, and a bookmark must not make a stale package look
    // freshly downloaded.
    downloadedAt: isOffline ? Date.now() : previous?.downloadedAt ?? null,
  });
}

// Flip an entry between the two states. Folders are per-section, so a
// topo that changes state leaves its folder and lands unfiled on the
// other side — filing it there again is the user's call.
export async function setDocumentMode(type, id, lang, mode) {
  const entry = await get(docKey(type, id, lang));
  if (!entry) return false;
  entry.mode = mode;
  entry.folderId = null;
  if (mode === OFFLINE_MODE) {
    entry.downloadedAt = Date.now();
  } else {
    // Leaving offline means the payload is no longer promised.
    entry.data = null;
  }
  await set(docKey(type, id, lang), entry);
  return true;
}

export async function getDocument(type, id, lang) {
  const entry = await get(docKey(type, id, lang));
  if (!entry) {
    return null;
  }
  // An online entry promises nothing without a network. Refuse it here
  // rather than at each call site, so that a legacy row still carrying a
  // payload cannot make one topo behave differently from another.
  return isOfflineEntry(entry) ? entry.data : null;
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
  return entries.filter(Boolean).map((e) => ({ ...e, mode: normaliseMode(e.mode) }));
}

// How the last full download went, for CDC §2.2 ("si le téléchargement est
// incomplet"). Written twice: once with done:false the moment the download
// starts, once with the result when it finishes. An entry still carrying
// done:false was interrupted — killed tab, tunnel, closed lid — and must be
// shown as incomplete rather than passing for a complete package.
//
// Absent entirely on topos saved before this existed: unknown, not broken,
// so nothing is claimed about them.
export async function setDocumentAssets(type, id, lang, assets) {
  const entry = await get(docKey(type, id, lang));
  if (!entry) return;
  entry.assets = assets;
  await set(docKey(type, id, lang), entry);
}

// Was the package fully fetched? Undefined means a legacy entry we cannot
// judge, and callers treat that as complete on purpose — alarming someone
// about a topo that is probably fine is its own failure.
export function isDownloadComplete(entry) {
  const assets = entry?.assets;
  if (!assets) return true;
  return assets.done === true && (assets.failed ?? 0) === 0;
}

export async function setDocumentFolder(type, id, lang, folderId) {
  const entry = await get(docKey(type, id, lang));
  if (!entry) {
    return;
  }
  entry.folderId = folderId;
  await set(docKey(type, id, lang), entry);
}

// Folders belong to one section. "Mes topos en ligne" and "Mes topos
// hors ligne" are organised independently, so a folder created on one
// side never appears on the other. A rename keeps the original section.
export async function saveFolder({ id, name, section = OFFLINE_MODE }) {
  const previous = await get(folderKey(id));
  await set(folderKey(id), {
    id,
    name,
    section: previous?.section ?? section,
    createdAt: previous?.createdAt ?? Date.now(),
  });
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
  const folders = await Promise.all(folderKeys.map((k) => get(k)));
  // Folders created before sections existed held downloaded topos —
  // back then everything was downloaded — so they belong offline.
  return folders.filter(Boolean).map((f) => (f.section ? f : { ...f, section: OFFLINE_MODE }));
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

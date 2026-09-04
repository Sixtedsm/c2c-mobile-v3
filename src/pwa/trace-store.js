// Durable storage for a GPS trace being recorded.
//
// The trace used to live inside the session's localStorage snapshot: one
// JSON.stringify of the whole array, rewritten every few seconds, growing
// with the outing. Three things were wrong with that, and all three are
// the kind that only show up on a real mountain:
//
//   1. Cost. A ten-hour trace is thousands of points; serialising all of
//      them on every flush is O(n) work on the main thread of a phone
//      that is already running a GPS.
//   2. Room. localStorage is about 5 MB for the whole origin, shared with
//      the auth token and with Yeti's imported courses. A long trace can
//      fill it, and then *everything* else fails to write too.
//   3. Silence. The write failure above was swallowed. Once the quota was
//      reached nothing was durable any more, and nothing said so.
//
// So the trace moves to IndexedDB, appended in chunks, and the session
// keeps only its small metadata in localStorage — deliberately, because
// localStorage.setItem is synchronous and therefore survives the phone
// killing the tab, which IndexedDB cannot promise during `pagehide`.
// Losing the metadata means losing the knowledge that a recording was
// running at all; losing the last chunk means losing a few points.
//
// Uses idb-keyval's default store and flat prefixed keys, exactly like
// src/pwa/offline-store.js, so a maintainer who has read one recognises
// the other.

import { delMany, getMany, keys, setMany } from 'idb-keyval';

const PREFIX = 'trace:';

// 200 points is roughly 17 KB of JSON — small enough that rewriting the
// tail chunk on every flush is cheap, large enough that a long outing
// holds tens of chunks rather than thousands.
export const CHUNK_SIZE = 200;

function chunkKey(traceId, index) {
  return `${PREFIX}${traceId}:${index}`;
}

// Enough to be unique across two tabs started in the same millisecond.
export function newTraceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Tell a full disk apart from a browser that refuses to store at all
// (private windows, blocked site data). The caller shows different words
// for each, and neither may be swallowed.
export function classifyStorageError(err) {
  if (!err) return null;
  if (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014) return 'quota';
  return 'blocked';
}

// Write everything recorded since `flushedCount`, and return the new
// count. Only the chunks that changed are touched: in steady state that
// is exactly one, so the cost per flush is flat for the whole outing
// however long it runs.
//
// Rewriting the trailing partial chunk rather than keeping a true append
// log is deliberate — it is idempotent, a lost write repairs itself on
// the next flush, and it never needs compacting.
//
// Rejects on failure; the caller decides what to say. It must not
// advance its own count when this rejects, or the points in the failed
// chunks would never be retried.
export async function writeTail(traceId, positions, flushedCount = 0) {
  if (!traceId || !Array.isArray(positions) || positions.length === 0) {
    return flushedCount;
  }
  // Captured before the await, and returned instead of re-reading the
  // array afterwards: the recorder keeps pushing while the write is in
  // flight, and reporting the later length would mark points as flushed
  // that were never written.
  const total = positions.length;
  if (total <= flushedCount) {
    // The trace shrank (discarded, or replaced on reload). Nothing to
    // append; the caller resets its cursor to match.
    return total;
  }

  const firstChunk = Math.floor(flushedCount / CHUNK_SIZE);
  const lastChunk = Math.floor((total - 1) / CHUNK_SIZE);

  const entries = [];
  for (let index = firstChunk; index <= lastChunk; index++) {
    entries.push([chunkKey(traceId, index), positions.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)]);
  }

  await setMany(entries);
  return total;
}

// Every chunk key belonging to a trace, in recorded order.
//
// Derived from what the store actually holds rather than from a stored
// count: if the two ever disagree, reading what exists degrades to a
// short trace, while trusting a count would read holes as data.
async function chunkKeysOf(traceId) {
  const prefix = `${PREFIX}${traceId}:`;
  const all = await keys();
  return all
    .filter((key) => typeof key === 'string' && key.startsWith(prefix))
    .map((key) => ({ key, index: Number(key.slice(prefix.length)) }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.key);
}

export async function loadTrace(traceId) {
  if (!traceId) return [];
  const ordered = await chunkKeysOf(traceId);
  if (!ordered.length) return [];
  const chunks = await getMany(ordered);
  const points = [];
  for (const chunk of chunks) {
    if (Array.isArray(chunk)) points.push(...chunk);
  }
  return points;
}

export async function deleteTrace(traceId) {
  if (!traceId) return;
  const ordered = await chunkKeysOf(traceId);
  if (ordered.length) await delMany(ordered);
}

// Drop traces left behind by outings that ended without cleaning up —
// a discarded recording, a tab killed between stop and save. Without
// this they would accumulate in IndexedDB forever, which is the failure
// this whole module exists to avoid.
export async function pruneTracesExcept(traceId) {
  const all = await keys();
  const keep = traceId ? `${PREFIX}${traceId}:` : null;
  const stale = all.filter(
    (key) => typeof key === 'string' && key.startsWith(PREFIX) && (!keep || !key.startsWith(keep))
  );
  if (stale.length) await delMany(stale);
  return stale.length;
}

// Ask the browser not to evict this origin under storage pressure.
//
// Without it the bucket is "best-effort": the trace, the offline topos
// and the sync queue can all be thrown away to make room for another
// site. Best called from a user gesture — Firefox grants it silently
// then, and prompts otherwise. Advisory: nothing may depend on the
// answer, which is why it never throws.
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

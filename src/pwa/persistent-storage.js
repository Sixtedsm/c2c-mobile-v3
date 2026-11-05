// Ask the browser not to evict this origin under storage pressure.
//
// Without it the bucket is "best-effort": the offline topos and the sync
// queue can be thrown away to make room for another site. Best called
// from a user gesture — Firefox grants it silently then, and prompts
// otherwise. Advisory: nothing may depend on the answer, which is why it
// never throws.
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

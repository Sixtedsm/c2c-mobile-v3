// Can this app talk to the Camptocamp API right now?
//
// "Network Error" used to cover three different situations. The one that
// mattered most arrived with the API release of 2026-09-13: requests whose
// Origin is not on the API's allowlist are answered with a 400 that carries
// no CORS headers. The browser then withholds the answer, and axios reports
// exactly what it reports when the phone has no signal. Topos showed red
// banners on a working connection, and the offline queue spent its retries
// against a server that was answering all along.
//
// Two probes tell the cases apart:
//
//   a normal (CORS) request succeeds only if the API lets this app read it;
//   a no-cors request succeeds whenever any server answers at all.
//
//   cors ok                   → 'ok'
//   cors fails, no-cors ok    → 'refused'   reachable, but not for this app
//   both fail                 → 'offline'
//
// /health is cheap, public and unauthenticated. The probe sends no
// credentials, so it never touches — and never depends on — the session.

const DEFAULT_TIMEOUT_MS = 5000;

async function attempt(fetchImpl, url, mode, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    await fetchImpl(url, {
      method: 'GET',
      mode,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal,
    });
    return 'ok';
  } catch (error) {
    return error?.name === 'AbortError' ? 'timeout' : 'failed';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Resolves to 'ok' | 'refused' | 'offline'. Never throws.
export async function probeApiAccess(apiBase, { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch || !apiBase) return 'offline';
  const url = `${String(apiBase).replace(/\/+$/, '')}/health`;

  try {
    const cors = await attempt(doFetch, url, 'cors', timeoutMs);
    if (cors === 'ok') return 'ok';
    // Slowness is not a refusal. Saying "Camptocamp blocks this app" to
    // someone on a weak signal would be a worse lie than "Network Error".
    if (cors === 'timeout') return 'offline';

    const opaque = await attempt(doFetch, url, 'no-cors', timeoutMs);
    return opaque === 'ok' ? 'refused' : 'offline';
  } catch {
    return 'offline';
  }
}

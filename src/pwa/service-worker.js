import { get, set } from 'idb-keyval';
/* The SW reads/writes only the per-document IDB entries; the pending-outings
 * queue is owned by the in-app $offline plugin so that the UI can stay in
 * sync. Keeping the two responsibilities separate prevents accidental races. */
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { CacheFirst } from 'workbox-strategies';

// ---------- Precache the app shell ----------

precacheAndRoute(self.__WB_MANIFEST || [], {
  ignoreURLParametersMatching: [/.*/],
});

cleanupOutdatedCaches();

// New SW activates immediately and takes over open clients so updates land on
// the next page load instead of waiting for every standalone tab to close.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------- Resolve absolute paths from the SW scope ----------

// On GitHub Pages the app is served under /c2c_ui/pwa-foundation/ ; on the
// final C2C deployment it will be served at /. The SW's registration scope
// gives us the right prefix in both cases, so handlers, caches.match() calls
// and fallback URLs all use the same key the precache manifest emits.
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const INDEX_HTML_PATH = new URL('index.html', self.registration.scope).pathname;

// ---------- SPA navigation fallback ----------

const navigationHandler = createHandlerBoundToURL(INDEX_HTML_PATH);
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/google[\w]*\.html$/, /^\/revive-adserver\.html$/],
  })
);

// ---------- C2C API documents: IDB-first with background refresh ----------

const DOC_PATH_REGEX = /^\/(articles|books|images|outings|routes|waypoints|xreports)\/(\d+)$/;
const DOC_SEARCH_REGEX = /^\?cook=([a-z]{2}(?:_[A-Z]{2})?)$/;
const PLURAL_TO_SINGULAR = {
  articles: 'article',
  books: 'book',
  images: 'image',
  outings: 'outing',
  routes: 'route',
  waypoints: 'waypoint',
  xreports: 'xreport',
};
const docKey = (type, id, lang) => `doc:${type}/${id}/${lang}`;

function parseDocRequest(url) {
  const pathMatch = DOC_PATH_REGEX.exec(url.pathname);
  const searchMatch = DOC_SEARCH_REGEX.exec(url.search);
  if (!pathMatch || !searchMatch) {
    return null;
  }
  const type = PLURAL_TO_SINGULAR[pathMatch[1]];
  if (!type) {
    return null;
  }
  return { type, id: pathMatch[2], lang: searchMatch[1] };
}

function buildDocResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-C2C-Source': 'offline-cache',
    },
  });
}

async function refreshDocFromNetwork(request, parsed) {
  try {
    const response = await fetch(request);
    if (!response.ok) {
      return;
    }
    const data = await response.clone().json();
    const previous = (await get(docKey(parsed.type, parsed.id, parsed.lang))) ?? {};
    await set(docKey(parsed.type, parsed.id, parsed.lang), {
      ...previous,
      type: parsed.type,
      id: parsed.id,
      lang: parsed.lang,
      data,
      savedAt: previous.savedAt ?? Date.now(),
      refreshedAt: Date.now(),
    });
  } catch {
    // Silent: a missed refresh is fine, the cached version stays valid.
  }
}

// Strategy: if the doc is in IDB → return it immediately (instant offline) and
// trigger a non-blocking network refresh. If not in IDB → go to network with a
// timeout; on network failure, return a clear 503 instead of letting the app's
// axios call fall through to a generic "Network error".
async function handleDocRequest({ request }) {
  const url = new URL(request.url);
  const parsed = parseDocRequest(url);

  if (parsed) {
    const entry = await get(docKey(parsed.type, parsed.id, parsed.lang));
    if (entry?.data) {
      refreshDocFromNetwork(request, parsed);
      return buildDocResponse(entry.data);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'Document is not saved for offline use and the network is unreachable.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

registerRoute(({ url, request }) => request.method === 'GET' && parseDocRequest(url) !== null, handleDocRequest);

// ---------- C2C images (cover + gallery) ----------

registerRoute(
  ({ url, request }) => {
    if (request.method !== 'GET') {
      return false;
    }
    if (!/camptocamp\.org$/.test(url.hostname)) {
      return false;
    }
    if (/^\/images\/proxy\/\d+/.test(url.pathname)) {
      return true;
    }
    return /\.(jpe?g|png|gif|svg|webp|avif)$/i.test(url.pathname);
  },
  new CacheFirst({
    cacheName: 'c2c-images',
    plugins: [
      // status 0 = opaque (no-cors) response, which is what we get for
      // cross-origin images. Without explicitly allowing it Workbox would
      // skip caching the prefetched images.
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 90 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ---------- Map tiles from any /{z}/{x}/{y}.* server ----------

registerRoute(
  ({ url, request }) => {
    if (request.method !== 'GET') {
      return false;
    }
    return /\/\d+\/\d+\/\d+\.(png|jpe?g|webp)(\?.*)?$/i.test(url.pathname + url.search);
  },
  new CacheFirst({
    cacheName: 'c2c-map-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 2000,
        maxAgeSeconds: 60 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ---------- In-scope static assets: precache-first with network fallback ----------

// Vue CLI emits JS / CSS chunks under our scope with hashed filenames. They
// are precached at build time, but if the active SW and the in-memory page
// somehow get out of sync (rare, but happens on iOS where the old page is
// still loaded when a new SW activates) the browser will request a hash that
// the SW does not have in its precache. Without this safety net the dynamic
// import would fail offline ("+ outing" → blank page). With it, the SW will
// transparently fall back to the network when online and cache the response
// for next time.
registerRoute(
  ({ url, request }) => {
    if (request.method !== 'GET') {
      return false;
    }
    if (url.origin !== self.location.origin) {
      return false;
    }
    if (!url.pathname.startsWith(SCOPE_PATH)) {
      return false;
    }
    return request.destination === 'script' || request.destination === 'style';
  },
  new CacheFirst({
    cacheName: 'c2c-app-chunks',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ---------- Last-resort catch handler ----------

setCatchHandler(async ({ request }) => {
  if (request.destination === 'document' || request.mode === 'navigate') {
    const cached = await caches.match(INDEX_HTML_PATH, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
  }
  return Response.error();
});

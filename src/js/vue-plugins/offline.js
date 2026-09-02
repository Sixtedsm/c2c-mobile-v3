import { toast } from 'bulma-toast';

import c2c from '@/js/apis/c2c';
import config from '@/js/config';
import { getImageUrl } from '@/js/image-urls';
import ol from '@/js/libs/ol';
import uploadFile from '@/js/upload-file';
import { extractEmbeddedImageIds, extractImageUrlsFromCooked } from '@/pwa/cooked-html-parser';
import * as store from '@/pwa/offline-store';

// Push one File through the existing V1 upload pipeline (EXIF parse +
// resize + POST to imageBackend). Adapts the callback-style helper to
// a Promise so sync code can `await` it cleanly. Returns the enriched
// image document (filename + width/height + EXIF fields) ready for
// c2c.createImages.
function uploadOnePhoto(file) {
  return new Promise((resolve, reject) => {
    uploadFile(
      file,
      0,
      () => {},
      () => {},
      (document) => resolve(document),
      (err) => {
        // Best-effort: pull a real reason out of whatever V1's upload
        // chain hands us (Axios error, DOM event, string, undefined).
        const msg =
          err?.response?.data?.description ||
          err?.response?.statusText ||
          err?.message ||
          (typeof err === 'string' ? err : 'upload failed');
        reject(new Error(msg));
      }
    );
  });
}

// Upload every photo then register them as C2C image documents in one
// createImages call. Returns the array of newly-created document_ids
// so the outing sync path can attach them via associations.images.
async function uploadPhotosAndCreateImages(files) {
  const documents = [];
  for (const file of files) {
    const doc = await uploadOnePhoto(file);
    documents.push(doc);
  }
  if (!documents.length) return [];
  const response = await c2c.createImages(documents);
  const created = response?.data?.images || [];
  return created.map((img) => img.document_id).filter(Boolean);
}

const IMAGE_SIZES_TO_PREFETCH = ['MI', 'SI'];

// Returns true when the asset made it into the cache.
//
// Honest limit of no-cors: the response is opaque, so a 404 resolves just
// like a 200 and is counted as a success. What this does catch is the case
// that matters — the network dying mid-download — because that throws. A
// topo whose images 404 individually is a server-side problem; a topo
// downloaded in a tunnel is the one the user needs warning about.
async function prefetchUrl(url) {
  try {
    // no-cors: browser-issued <img> requests are also no-cors, so the cached
    // opaque response will match cleanly when the image is rendered offline.
    // Using cors here would fail for any C2C image host that does not send
    // Access-Control-Allow-Origin (which is most of them) and would leave us
    // with zero cached images.
    await fetch(url, { cache: 'reload', mode: 'no-cors' });
    return true;
  } catch {
    // One failure does not abort the save — the topo is still worth having,
    // it is just not complete, and the caller records that.
    return false;
  }
}

// Running total of a download: how many assets were attempted and how many
// did not make it. `done` flips once nothing is left in flight.
function emptyTally() {
  return { attempted: 0, failed: 0 };
}

function addToTally(tally, ok) {
  tally.attempted += 1;
  if (!ok) tally.failed += 1;
  return tally;
}

function mergeTallies(a, b) {
  return { attempted: a.attempted + b.attempted, failed: a.failed + b.failed };
}

async function prefetchImageVariants(imageDoc) {
  const tally = emptyTally();
  if (!imageDoc) {
    return tally;
  }
  for (const size of IMAGE_SIZES_TO_PREFETCH) {
    const url = getImageUrl(imageDoc, size);
    if (url) {
      addToTally(tally, await prefetchUrl(url));
    }
  }
  return tally;
}

async function prefetchSrcsFromCooked(cooked) {
  const tally = emptyTally();
  for (const url of extractImageUrlsFromCooked(cooked, config.urls.api)) {
    // We pull both real src= URLs and reconstructed c2c:url-proxy URLs so the
    // service worker caches exactly the URLs the browser will request when
    // rendering the topo offline (including avif/webp <picture> variants).
    addToTally(tally, await prefetchUrl(url));
  }
  return tally;
}

// ---------- Pre-cache map tiles around the trace ----------

// Zoom levels chosen for outdoor / mountain use:
//  11: massif overview
//  12: zone scale
//  13: trail scale
//  14: detailed
//  15: very detailed (only when the bounding box is small)
const TILE_ZOOM_LEVELS = [11, 12, 13, 14, 15];
const MAX_TILES_PER_SAVE = 250;
// OpenTopoMap is C2C's default carto layer; we mirror the URL the OpenLayers
// XYZ source builds so the prefetched response matches the runtime request.
const OPENTOPOMAP_SUBDOMAINS = ['a', 'b', 'c'];

function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
}

function collectGeometryCoordinates(geometry) {
  if (!geometry || !geometry.type) {
    return [];
  }
  if (geometry.type === 'Point') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
    return geometry.coordinates;
  }
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2);
  }
  if (geometry.type === 'GeometryCollection') {
    return (geometry.geometries || []).flatMap(collectGeometryCoordinates);
  }
  return [];
}

function getLonLatBboxFromC2cGeom(geomJson) {
  if (!geomJson) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(geomJson);
  } catch {
    return null;
  }
  const coords3857 = collectGeometryCoordinates(parsed);
  if (!coords3857.length) {
    return null;
  }
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const xy of coords3857) {
    const [lon, lat] = ol.proj.toLonLat(xy);
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLon)) {
    return null;
  }
  return { minLon, minLat, maxLon, maxLat };
}

function expandBbox(bbox, paddingDeg) {
  return {
    minLon: bbox.minLon - paddingDeg,
    minLat: bbox.minLat - paddingDeg,
    maxLon: bbox.maxLon + paddingDeg,
    maxLat: bbox.maxLat + paddingDeg,
  };
}

function buildOpenTopoMapTileUrls(bbox) {
  // Pad the box slightly so the user can pan around the trace before going
  // offline without losing the surrounding context (~1.5 km at mid-latitudes).
  const padded = expandBbox(bbox, 0.015);
  const urls = [];
  for (const z of TILE_ZOOM_LEVELS) {
    const [x1, y1] = lonLatToTile(padded.minLon, padded.maxLat, z); // NW corner
    const [x2, y2] = lonLatToTile(padded.maxLon, padded.minLat, z); // SE corner
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
        // OpenLayers XYZ rotates subdomains by tile hash; we cover all three
        // so whatever subdomain the runtime picks finds the tile in cache.
        for (const sub of OPENTOPOMAP_SUBDOMAINS) {
          urls.push(`https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`);
        }
      }
    }
    if (urls.length >= MAX_TILES_PER_SAVE) {
      // Higher zoom levels would blow up the cache for large traces; stop here.
      break;
    }
  }
  return urls.slice(0, MAX_TILES_PER_SAVE);
}

async function prefetchTilesForDocument(data) {
  const tally = emptyTally();
  const geom = data?.geometry?.geom_detail || data?.geometry?.geom;
  const bbox = getLonLatBboxFromC2cGeom(geom);
  if (!bbox) {
    // No geometry, so no tiles were ever owed. Not a partial download.
    return tally;
  }
  const urls = buildOpenTopoMapTileUrls(bbox);
  // We fire requests in small parallel batches so the tile servers do not
  // see a single burst of 200 connections (some throttle aggressively).
  const BATCH = 6;
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((url) => prefetchUrl(url)));
    for (const ok of results) addToTally(tally, ok);
  }
  return tally;
}

// PWA app badge (#18): mirrors the offline-outing queue length on the
// PWA's home-screen icon when the user has the app installed. Uses the
// standard Badging API (Chrome / Edge / Safari 16.4+). Quietly no-ops
// elsewhere — there is no browser-prompt or permission to request.
function updateAppBadge(count) {
  try {
    if ('setAppBadge' in navigator && 'clearAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  } catch {
    // Older Safari: setAppBadge exists but throws synchronously when the
    // page isn't a PWA / not installed. Ignore — the badge just won't
    // appear, which is the correct fallback.
  }
}

// Real-connectivity ping. `navigator.onLine` is only a coarse hint —
// it goes false whenever a NIC drops (VPN toggle, Wi-Fi handoff, wake
// from sleep on Windows) and can stay stuck false for tens of seconds
// after the connection is really back. We verify with a tiny fetch
// against the C2C API before flipping the app into offline mode.
// Falls back to the forum origin if the API host is unreachable but
// the network is up. Returns a boolean; never throws.
async function pingReachable() {
  const targets = [config.urls.api, config.urls.forum].filter(Boolean);
  for (const base of targets) {
    try {
      // A GET with no-store beats HEAD here — some C2C endpoints 405
      // on HEAD and the browser reports that as a network error to
      // JS. no-cors keeps the request cheap (opaque response is
      // enough: what we care about is that any byte came back).
      const url = base.replace(/\/+$/, '') + '/?_ping=' + Date.now();
      const ctl = new AbortController();
      const timer = window.setTimeout(() => ctl.abort(), 4000);
      try {
        await fetch(url, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
          signal: ctl.signal,
        });
        return true;
      } finally {
        // Must be a finally: the fetch rejects precisely when we are
        // offline — the common case — and the old code cleared the
        // timer only on the success path. Every failed probe left a
        // 4 s timer behind, and the offline re-check loop fires one
        // every 15 s.
        window.clearTimeout(timer);
      }
    } catch {
      // try the next target
    }
  }
  return false;
}

// The slim descriptor kept for every saved topo, in both states. An
// online entry holds no document, so this is the only thing its card in
// "Mes topos" has to work with — and a topo demoted back to online must
// not degrade into an "Untitled" row.
function buildMeta(data, lang) {
  const locales = Array.isArray(data?.locales) ? data.locales : [];
  const locale = locales.find((l) => l.lang === lang) ?? locales[0] ?? null;
  return {
    title: data?.cooked?.title ?? locale?.title ?? null,
    activities: Array.isArray(data?.activities) ? data.activities : [],
    elevation: data?.elevation_max ?? data?.elevation ?? null,
  };
}

export default function install(Vue) {
  const vm = new Vue({
    name: 'OfflinePlugin',

    data() {
      return {
        // Start optimistic: many browsers boot with navigator.onLine
        // set to `false` for the first few ms after cold-launch, which
        // otherwise flashes the offline banner. If we're really offline,
        // pingReachable() will bring us back within a couple of seconds.
        online: true,
        savedDocs: [],
        folders: [],
        pendingOutings: [],
        downloading: new Set(),
        syncing: false,
        // Timers used by the connectivity verifier — kept on the
        // instance so we can cancel them on teardown / re-entry.
        offlineDebounceT: null,
        offlineRecheckT: null,
      };
    },

    computed: {
      // Only the topos that are genuinely mountain-ready. This is what
      // the offline-route picker on the outing form must show: a light
      // save has no map tiles and no images, so offering it there would
      // promise something the app cannot deliver in the field — and the
      // endless list was the reason for splitting the two modes in the
      // first place.
      offlineDocs() {
        return this.savedDocs.filter((e) => e.mode === store.OFFLINE_MODE);
      },
      // "Mes topos en ligne": saved for later, but needing a network to
      // open. The trip-planning list.
      onlineDocs() {
        return this.savedDocs.filter((e) => e.mode === store.ONLINE_MODE);
      },
    },

    watch: {
      // Keep the PWA app badge in sync with the queue.
      'pendingOutings.length': {
        handler(count) {
          updateAppBadge(count);
        },
        immediate: true,
      },
    },

    created() {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      // Wake-up hook: after a laptop sleep/resume or a tab returning
      // to foreground, navigator.onLine may still be stuck false even
      // though the network is back. Verify on visibility change and
      // on window focus.
      document.addEventListener('visibilitychange', this.handleVisibility);
      window.addEventListener('focus', this.handleFocus);
      // If navigator says we're offline at boot, verify before
      // trusting it (Windows Chrome frequently boots with the flag
      // wrongly false in a corporate/hotel network).
      if (navigator.onLine === false) {
        this.verifyConnectivity({ trigger: 'boot' });
      }
      // Refresh in the background so the plugin is immediately usable
      // and the first paint isn't blocked by IndexedDB reads (which
      // can be 100-200 ms on a user with 20+ saved docs). Components
      // that use $offline.savedDocs / .folders / .pendingOutings re-
      // render reactively as soon as refresh() populates them.
      this.refresh()
        .then(() => {
          if (this.online && this.pendingOutings.length) {
            this.syncPendingOutings();
          }
        })
        .catch(() => {
          /* If IndexedDB is unavailable (private-mode Safari, quota
             exceeded…) we still want the app to start; the offline
             state just stays empty. */
        });
    },

    methods: {
      handleOnline() {
        // Coming back up: trust it immediately. If it's a false
        // positive, the next real request will fail and we'll bounce
        // back through handleOffline / verifyConnectivity.
        if (this.offlineDebounceT) {
          window.clearTimeout(this.offlineDebounceT);
          this.offlineDebounceT = null;
        }
        if (this.offlineRecheckT) {
          window.clearTimeout(this.offlineRecheckT);
          this.offlineRecheckT = null;
        }
        this.online = true;
        if (this.pendingOutings.length) {
          this.syncPendingOutings();
        }
      },

      // navigator.onLine has a long track record of false negatives
      // (Chrome on Windows especially: reports offline for tens of
      // seconds after wake, after a VPN toggle, after a Wi-Fi handoff,
      // and sometimes stays stuck until the tab is refocused). So we
      // don't flip the app immediately — we defer 1.5 s and confirm
      // with an actual network probe. If the probe succeeds, we stay
      // online; the browser event was a lie.
      handleOffline() {
        if (this.offlineDebounceT) window.clearTimeout(this.offlineDebounceT);
        this.offlineDebounceT = window.setTimeout(() => {
          this.verifyConnectivity({ trigger: 'offline-event' });
        }, 1500);
      },

      // Re-check on tab return / window focus. If the app was left
      // in the background during a network hiccup and the browser
      // never re-fired an `online` event, this catches it.
      handleVisibility() {
        if (document.visibilityState === 'visible' && !this.online) {
          this.verifyConnectivity({ trigger: 'visibility' });
        }
      },
      handleFocus() {
        if (!this.online) {
          this.verifyConnectivity({ trigger: 'focus' });
        }
      },

      // Real-connectivity probe with recovery. When the app is
      // currently marked offline, this schedules a follow-up probe
      // every 15 s so we auto-recover as soon as the network is
      // actually back, without the user having to reload.
      async verifyConnectivity() {
        const reachable = await pingReachable();
        if (reachable) {
          this.handleOnline();
          return;
        }
        // Only flip to offline once we have actually confirmed the
        // network is down. This is the ONE codepath allowed to set
        // `online = false` — the browser event never does directly.
        this.online = false;
        // Auto-recovery: keep polling every 15 s while offline. Only
        // one loop at a time.
        if (this.offlineRecheckT) window.clearTimeout(this.offlineRecheckT);
        this.offlineRecheckT = window.setTimeout(() => {
          this.offlineRecheckT = null;
          if (!this.online) this.verifyConnectivity({ trigger: 'recheck' });
        }, 15000);
      },

      async refresh() {
        this.savedDocs = await store.listDocuments();
        this.folders = await store.listFolders();
        this.pendingOutings = await store.listPendingOutings();
      },

      isSaved(type, id, lang) {
        return this.savedDocs.some(
          (entry) => entry.type === type && String(entry.id) === String(id) && entry.lang === lang
        );
      },

      // True only when the full package is on the device. Callers that
      // gate a "works without network" promise must use this, never
      // isSaved() — which is true for a light save too.
      isOfflineReady(type, id, lang) {
        return this.savedDocs.some(
          (entry) =>
            entry.type === type &&
            String(entry.id) === String(id) &&
            entry.lang === lang &&
            entry.mode === store.OFFLINE_MODE
        );
      },

      isDownloading(type, id, lang) {
        return this.downloading.has(`${type}/${id}/${lang}`);
      },

      // Save a topo to "Mes topos".
      //
      // Default is a LIGHT save: the document JSON only. It reads
      // offline as text and costs tens of KB. The heavy package —
      // embedded images, gallery variants and ~250 surrounding map
      // tiles, i.e. megabytes — is fetched only when the user asks for
      // it explicitly, through downloadForOffline().
      //
      // This is deliberate (Sixte, 2026-09-02): saving everything by
      // default filled up storage and made the offline-route picker on
      // the outing form unusable. The trade-off is that a bookmark no
      // longer means "ready for the mountain", so every surface showing
      // a saved topo has to make the difference obvious.
      async saveDocument({ type, id, lang, folderId = null, mode = store.ONLINE_MODE }) {
        const key = `${type}/${id}/${lang}`;
        if (this.downloading.has(key)) {
          return;
        }
        this.downloading = new Set([...this.downloading, key]);
        try {
          const service = c2c[type];
          if (!service) {
            throw new Error(`Unknown document type: ${type}`);
          }
          const { data } = await service.getCooked(id, lang);
          // The descriptor is stored in both states. An online entry has
          // no payload to draw its card from, and a topo demoted back to
          // online later must not turn into an "Untitled" row.
          await store.saveDocument({ type, id, lang, data, meta: buildMeta(data, lang), folderId, mode });
          if (mode === store.OFFLINE_MODE) {
            // Mark the download open before fetching a single asset. If the
            // app dies here — tunnel, killed tab, closed lid — the entry
            // stays open and "Mes topos" says so, which is exactly what
            // CDC §2.2 asks to make visible.
            await store.setDocumentAssets(type, id, lang, { done: false, startedAt: Date.now() });
            const tally = await this.prefetchOfflineAssets(data, lang, folderId);
            // Tiles keep going after this returns: 250 of them would make
            // the button spin far too long. The entry stays open until they
            // land, then closes itself.
            this.prefetchTilesInBackground(type, id, lang, data, tally);
          }
          await this.refresh();
        } finally {
          const next = new Set(this.downloading);
          next.delete(key);
          this.downloading = next;
        }
      },

      // Everything that makes a topo usable without a network, minus the
      // map tiles (see prefetchTilesInBackground). Split out of saveDocument
      // so an online save can skip it wholesale.
      //
      // Returns { attempted, failed } so the caller can tell the user
      // whether the topo they are about to carry is actually complete.
      async prefetchOfflineAssets(data, lang, folderId) {
        let tally = emptyTally();
        // Strategy: cache the EXACT URLs the browser will request when
        // rendering the topo offline.
        //
        // 1) Pull every src= URL out of the cooked HTML and fetch them as-is.
        //    Whatever pattern the server-side cooker emits (proxy URL, media
        //    direct, etc.) is what the browser will ask for later, so this
        //    is the most reliable way to populate the SW image cache.
        tally = mergeTallies(tally, await prefetchSrcsFromCooked(data?.cooked));

        // 2) Gallery images (associations.images): prefetch the size
        //    variants the gallery template usually requests (MI for the
        //    grid, SI for the thumbnail strip). These go through getImageUrl
        //    which constructs the same URL the gallery will build.
        const associatedImages = Array.isArray(data?.associations?.images) ? data.associations.images : [];
        for (const image of associatedImages) {
          try {
            tally = mergeTallies(tally, await prefetchImageVariants(image));
          } catch {
            // An unexpected throw is still one asset that did not make it.
            addToTally(tally, false);
          }
        }

        // 3) Map tiles are handled by the caller, after this returns — see
        //    prefetchTilesInBackground.

        // 4) Also persist the lightweight image metadata for images that are
        //    embedded by id (so a later code path that calls c2c.image.get…
        //    on them still resolves offline). These sub-documents really are
        //    downloaded, so they keep the offline mode.
        const embeddedIds = extractEmbeddedImageIds(data?.cooked).map(String);
        const associatedIds = new Set(associatedImages.map((img) => String(img.document_id)));
        for (const imageId of embeddedIds) {
          if (associatedIds.has(imageId)) {
            continue;
          }
          try {
            const imgResponse = await c2c.image.getCooked(imageId, lang);
            await store.saveDocument({
              type: 'image',
              id: imageId,
              lang,
              data: imgResponse.data,
              folderId,
              mode: store.OFFLINE_MODE,
            });
            tally = mergeTallies(tally, await prefetchImageVariants(imgResponse.data));
          } catch {
            addToTally(tally, false);
          }
        }
        return tally;
      },

      // The topographic base layer around the trace (OpenTopoMap, the C2C
      // fallback). Deliberately not awaited by the caller: ~250 tiles take
      // long enough that blocking the save would read as a hang.
      //
      // It closes the download instead — merging its own result into the
      // tally and writing the final one. Until that happens the entry
      // stays marked open, so a save interrupted halfway through the tiles
      // is shown as incomplete rather than silently passing for complete.
      prefetchTilesInBackground(type, id, lang, data, baseTally) {
        return prefetchTilesForDocument(data)
          .catch(() => emptyTally())
          .then(async (tileTally) => {
            const total = mergeTallies(baseTally, tileTally);
            await store.setDocumentAssets(type, id, lang, { ...total, done: true, at: Date.now() });
            await this.refresh();
          })
          .catch(() => {
            /* the entry simply stays marked incomplete */
          });
      },

      // Tell the user, at the moment of the gesture, that saving a topo
      // does not make it available without a network.
      //
      // This runs on a single user-initiated save only — never on the
      // bulk page save or a day pack, where one toast per document would
      // be noise. It carries the download action itself: the second step
      // is the whole point of the split, so making the user go hunt for
      // it elsewhere would just trade one confusion for another.
      //
      // bulma-toast renders an HTMLElement message as-is, which is what
      // lets the button be real rather than a link we cannot wire.
      notifyOnlineOnly(type, id, lang) {
        if (typeof document === 'undefined') return;
        const t = typeof this.$gettext === 'function' ? this.$gettext.bind(this) : (m) => m;
        const box = document.createElement('div');
        box.className = 'light-save-toast';

        // Deliberately states one thing only (Sixte, 2026-09-02). The
        // earlier wording enumerated what was missing — no photos, no
        // map, text kept — and readers took "text is kept" to mean "it
        // works offline". The single fact below is what matters; the
        // button right under it is how you change that fact.
        const line = document.createElement('span');
        line.textContent = t('Enregistré dans « Mes topos en ligne ». Ce topo ne sera pas accessible hors ligne.');
        box.appendChild(line);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'light-save-toast-btn';
        btn.textContent = t('Enregistrer hors ligne');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = t('Enregistrement…');
          try {
            await this.downloadForOffline(type, id, lang);
            btn.textContent = t('Enregistré hors ligne ✓');
          } catch {
            btn.disabled = false;
            btn.textContent = t('Échec — réessayer');
          }
        });
        box.appendChild(btn);

        toast({
          message: box,
          type: 'is-info',
          position: 'bottom-center',
          // Long enough to read the line and reach the button on a phone.
          duration: 8000,
          dismissible: true,
          // Otherwise tapping the button also dismisses the toast and the
          // user never sees whether the download worked.
          closeOnClick: false,
        });
      },

      // Promote a topo to a full offline package. Re-fetches the document
      // on the way, so one saved months ago also comes back up to date.
      //
      // It arrives unfiled: the two sections keep independent folder sets
      // (Sixte, 2026-09-02), so the folder it had among the online topos
      // means nothing on the offline side. Filing it there is the user's
      // call — and carrying the id over would point at a folder the
      // offline section does not display.
      async downloadForOffline(type, id, lang) {
        return this.saveDocument({ type, id, lang, folderId: null, mode: store.OFFLINE_MODE });
      },

      // Demote back to an online entry: the topo stays in "Mes topos",
      // moving to the online section, and needs a network again. As with
      // the promotion, it arrives unfiled on the other side.
      //
      // Honest limitation: images already pulled into the service-worker
      // cache are not evicted here. Cache Storage has no per-document
      // index and one image can belong to several topos, so deleting by
      // URL would risk breaking a sibling. That space is reclaimed by the
      // SW cache policy, not by this call.
      async removeOfflineData(type, id, lang) {
        await store.setDocumentMode(type, id, lang, store.ONLINE_MODE);
        await this.refresh();
      },

      async removeDocument(type, id, lang) {
        await store.deleteDocument(type, id, lang);
        await this.refresh();
      },

      // Guarded removal used by the document-header bookmark + ToolBox
      // "Save offline" — both used to delete silently on tap, and an
      // accidental press on the trail wiped Sixte's only access to a
      // saved topo. The caller passes a translated message so this
      // plugin stays free of i18n. OfflineView keeps its own confirm
      // dialog (different wording for the listing context), so the
      // plugin doesn't double-prompt. Returns true if removal happened.
      async confirmAndRemoveDocument(type, id, lang, message) {
        if (typeof window === 'undefined' || !window.confirm(message)) return false;
        await this.removeDocument(type, id, lang);
        return true;
      },

      // section is ONLINE_MODE or OFFLINE_MODE — folders are per-section
      // and never shared between the two halves of "Mes topos".
      async createFolder(name, section = store.OFFLINE_MODE) {
        const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await store.saveFolder({ id, name, section });
        await this.refresh();
        return id;
      },

      foldersInSection(section) {
        return this.folders.filter((f) => f.section === section);
      },

      async renameFolder(id, name) {
        await store.saveFolder({ id, name });
        await this.refresh();
      },

      async removeFolder(id) {
        // store.deleteFolder already nulls folderId on contained docs
        // before deleting the folder itself — no extra orphan reassign
        // needed here.
        await store.deleteFolder(id);
        await this.refresh();
      },

      async moveDocumentToFolder(type, id, lang, folderId) {
        await store.setDocumentFolder(type, id, lang, folderId);
        await this.refresh();
      },

      // "Pack sortie du jour" (CDC §2.2): a one-tap way to bundle a
      // route with the surrounding waypoints (hut, summit, access,
      // bivouac, water source, pass, cliff…) into one folder, so a
      // single tap prepares an outing for offline consultation on the
      // trail. Skips the associated documents that are already saved,
      // and swallows individual failures — the main doc is what
      // matters; a missing waypoint should not fail the whole pack.
      async saveDayPack({ type, id, lang, folderName }) {
        // Fetch the main doc first to read its associations. We save it
        // into the freshly created folder to keep the pack self-contained.
        const service = c2c[type];
        if (!service) {
          throw new Error(`Unknown document type: ${type}`);
        }
        const folderId = await this.createFolder(folderName || `Pack ${new Date().toLocaleDateString('fr-FR')}`);
        // A day pack is explicitly "prepare this for the field", so every
        // document in it is downloaded in full — never a light save.
        await this.saveDocument({ type, id, lang, folderId, mode: store.OFFLINE_MODE });

        const mainDoc = await store.getDocument(type, id, lang);
        const associations = mainDoc?.associations ?? {};
        const associatedWaypoints = [...(associations.waypoints ?? []), ...(associations.waypoint_children ?? [])];
        for (const wp of associatedWaypoints) {
          const wpId = wp?.document_id;
          if (!wpId) continue;
          if (this.isSaved('waypoint', wpId, lang)) continue;
          try {
            await this.saveDocument({ type: 'waypoint', id: wpId, lang, folderId, mode: store.OFFLINE_MODE });
          } catch {
            /* one missing waypoint should not tank the pack */
          }
        }
        return folderId;
      },

      async getDocument(type, id, lang) {
        return store.getDocument(type, id, lang);
      },

      async getStorageUsage() {
        return store.estimateUsage();
      },

      // Purge saved documents + folders. With no argument it clears both
      // sections; passing one clears just that half, which is what the
      // "Tout vider" button in "Mes topos" does — it sits under a tab, so
      // it must not touch the list the user cannot see.
      //
      // Pending outings are left alone on purpose: they represent unsync'd
      // user data and losing them silently would be a real data-loss
      // regression. The user can discard each pending item individually
      // from the OfflineView list.
      async purgeAllDocuments(section = null) {
        const docs = this.savedDocs.filter((d) => !section || d.mode === section);
        for (const d of docs) {
          try {
            await store.deleteDocument(d.type, d.id, d.lang);
          } catch {
            /* keep going — one failure shouldn't halt the purge */
          }
        }
        const folders = this.folders.filter((f) => !section || f.section === section);
        for (const f of folders) {
          try {
            await store.deleteFolder(f.id);
          } catch {
            /* ditto */
          }
        }
        await this.refresh();
      },

      async queueOuting(document, { photos = [], needsRouteAssoc = false, routeNote = '' } = {}) {
        // Photos are stored as raw File/Blob in IndexedDB (idb-keyval
        // handles Blobs natively — no base64 blow-up). They're uploaded
        // + associated to the outing at sync time; see syncPendingOutings.
        const photoList = Array.isArray(photos) ? photos.slice(0, 20) : [];
        // Warn if the user attached more than the queue can carry so
        // the extras don't disappear silently.
        if (Array.isArray(photos) && photos.length > 20) {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4000,
            message: `Seules les 20 premières photos ont été mises en file (sur ${photos.length}). Ajoutez les autres directement sur le site après publication.`,
          });
        }
        const entry = await store.enqueuePendingOuting({
          payload: document,
          title: document?.locales?.[0]?.title || this.$gettext?.('Untitled') || 'Untitled',
          photos: photoList,
          // Terrain-first flow (#Loïc feedback 2026-09): the user can
          // save a sortie offline without picking a real itinéraire
          // (the API refuses that). Those items stay in the queue and
          // are skipped by syncPendingOutings until the user opens
          // OfflineView and completes the association from there.
          needsRouteAssoc: !!needsRouteAssoc,
          routeNote: typeof routeNote === 'string' ? routeNote.trim() : '',
        });
        this.pendingOutings = await store.listPendingOutings();
        return entry;
      },

      // Called by OfflineView after the user picked a real itinéraire
      // for a pending outing that had been queued with only a text
      // note. Merges the chosen routes into the payload, clears the
      // needsRouteAssoc flag, and triggers a sync run so the item
      // publishes right away (assuming the device is back online).
      async attachRoutesToPendingOuting(id, routes) {
        const list = Array.isArray(routes) ? routes : [routes];
        const routeStubs = list
          .filter((r) => r && r.document_id != null)
          .map((r) => ({ document_id: Number(r.document_id) }));
        if (!routeStubs.length) return;
        const queue = await store.listPendingOutings();
        const next = queue.map((item) => {
          if (item.id !== id) return item;
          const existing = item.payload?.associations?.routes || [];
          const seen = new Set(existing.map((r) => Number(r.document_id)));
          const merged = [...existing, ...routeStubs.filter((r) => !seen.has(Number(r.document_id)))];
          return {
            ...item,
            payload: {
              ...item.payload,
              associations: {
                ...(item.payload?.associations || {}),
                routes: merged,
              },
            },
            needsRouteAssoc: false,
            // Reset transient error/conflict state so the next sync
            // attempt is treated as fresh — the item was intentionally
            // held back, not rejected.
            lastError: null,
            conflict: false,
          };
        });
        await store.replacePendingOutings(next);
        this.pendingOutings = next;
        if (this.online) {
          this.syncPendingOutings();
        }
      },

      // Public entry point for the pending-outing queue. Claims the
      // re-entrancy lock SYNCHRONOUSLY — before any await — then hands
      // off to runPendingOutingsSync for the actual work.
      async syncPendingOutings() {
        if (this.syncing || !this.online) {
          return;
        }
        // The lock used to be claimed *after* the first await, which
        // left a window where two callers both passed the check above:
        // the online event handler firing while the user also taps
        // "Synchroniser" in OfflineView. Both then read the same queue
        // and POSTed it, publishing every pending outing twice on the
        // user's camptocamp.org account. Claiming it here closes that
        // window — a second caller now returns on the guard.
        this.syncing = true;
        try {
          await this.runPendingOutingsSync();
        } catch {
          // Reaching here means the pass itself blew up rather than an
          // individual outing failing (those are caught per item inside
          // the loop) — in practice an IndexedDB write that could not
          // complete. Without this catch the rejection escaped to all
          // four call sites, three of which are fire-and-forget and
          // would have turned it into an unhandled rejection the user
          // never sees. Surface it instead: the queue is intact on
          // disk, so retrying later is the right move.
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 5000,
            message: `Synchronisation interrompue. Vos sorties sont conservées, réessayez depuis « Mes topos ».`,
          });
        } finally {
          // Releasing in `finally` is what makes the queue survive a
          // failed run. This used to be a bare statement after the
          // loop, so an IndexedDB write failure (quota exceeded,
          // private-mode Safari, store locked by another tab) escaped
          // before reaching it and left `syncing` stuck true for the
          // rest of the session: every later sync returned silently
          // on the guard and the queue never published again, with no
          // feedback to the user.
          this.syncing = false;
        }
      },

      // Actual sync pass. Never call directly — go through
      // syncPendingOutings so the re-entrancy lock is honoured.
      async runPendingOutingsSync() {
        const queue = await store.listPendingOutings();
        if (!queue.length) {
          return;
        }
        const remaining = [];
        let published = 0;
        let newConflicts = 0;
        for (const item of queue) {
          // Items previously flagged as conflicting stay in the queue
          // without being retried — the user has to explicitly resolve
          // them (retry / discard) via the OfflineView UI. Prevents an
          // auto-retry storm from re-triggering the same 409 on every
          // reconnect.
          if (item.conflict) {
            remaining.push(item);
            continue;
          }
          // Items saved with the "à compléter plus tard" flow have no
          // real itinéraire attached yet — the API would 400 on the
          // routes association. Skip them; OfflineView exposes a
          // "Renseigner l'itinéraire" action that clears the flag
          // and re-triggers this loop.
          if (item.needsRouteAssoc) {
            remaining.push(item);
            continue;
          }
          // Preserve uploaded image ids across retries — if photos were
          // successfully uploaded on a prior attempt and only the
          // outing.create() call failed, don't re-upload (would create
          // duplicate images on the user's C2C account).
          let uploadedImageIds = item.uploadedImageIds || [];
          try {
            if (Array.isArray(item.photos) && item.photos.length > 0 && uploadedImageIds.length === 0) {
              uploadedImageIds = await uploadPhotosAndCreateImages(item.photos);
            }
            const payload = { ...item.payload };
            if (uploadedImageIds.length > 0) {
              payload.associations = {
                ...(payload.associations || {}),
                images: [
                  ...(payload.associations?.images || []),
                  ...uploadedImageIds.map((document_id) => ({ document_id })),
                ],
              };
            }
            // Migration guard: early V3 builds queued outing payloads
            // without the required `users` association. Inject the
            // currently-logged-in user id so those pre-existing pending
            // drafts don't stay stuck forever on the API validation.
            const hasUsers = Array.isArray(payload.associations?.users) && payload.associations.users.length > 0;
            if (!hasUsers && this.$user?.id) {
              payload.associations = {
                ...(payload.associations || {}),
                users: [{ document_id: Number(this.$user.id) }],
              };
            }
            const response = await c2c.outing.create(payload);
            if (!response?.data?.document_id) {
              remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: 'no-id',
                uploadedImageIds,
              });
            } else {
              published += 1;
            }
          } catch (error) {
            const status = error?.response?.status;
            // Pull the richest human-readable reason we can. C2C's
            // API returns `{status:"error", errors:[{name,description}]}`
            // on validation failures — surface that so the offline UI
            // shows "400 activities: required" instead of just "400".
            const apiErrors = error?.response?.data?.errors;
            const bodyDetail = apiErrors
              ? apiErrors.map((e) => `${e.name || 'field'}: ${e.description || 'error'}`).join(', ')
              : error?.response?.data?.description || error?.message || 'network';
            const readable = status ? `${status} — ${bodyDetail}` : bodyDetail;
            // 409 Conflict = a referenced route / waypoint was edited
            // upstream between the offline draft and the publish attempt
            // (CDC §2.4 "gestion des conflits"). Freeze the item and
            // surface it in the UI — an auto-retry would just fail
            // identically and the user has to make the call.
            if (status === 409) {
              remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: readable,
                conflict: true,
                uploadedImageIds,
              });
              newConflicts += 1;
            } else {
              remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: readable,
                uploadedImageIds,
              });
            }
          }
        }
        await store.replacePendingOutings(remaining);
        this.pendingOutings = remaining;

        // Toast feedback (#21). Auto-sync runs silently in the background
        // — without a notification, users have no idea their outings made
        // it to the server. We only chirp when something actually moved.
        if (published > 0) {
          toast({
            type: 'is-success',
            position: 'bottom-center',
            message: published === 1 ? `1 sortie publiée en ligne.` : `${published} sorties publiées en ligne.`,
          });
        }
        if (remaining.length && published === 0 && queue.length) {
          // Every attempt failed — surface it so the user can act (likely
          // a server-side validation issue or auth expiry).
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            message: `Échec de la synchronisation. Ouvrez « Mes topos » pour réessayer.`,
          });
        }
        if (newConflicts > 0) {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 5000,
            message:
              newConflicts === 1
                ? `1 sortie en conflit : ouvrez « Mes topos » pour la résoudre.`
                : `${newConflicts} sorties en conflit : ouvrez « Mes topos » pour les résoudre.`,
          });
        }
      },

      // Mark a conflicted item as ready to retry — clears the frozen
      // flag so the next syncPendingOutings() picks it up again. The
      // caller (OfflineView "Réessayer") decides when to do this after
      // the user has read the warning.
      async retryConflictedOuting(id) {
        const queue = await store.listPendingOutings();
        const next = queue.map((item) => (item.id === id ? { ...item, conflict: false, lastError: null } : item));
        await store.replacePendingOutings(next);
        this.pendingOutings = next;
        if (this.online) {
          this.syncPendingOutings();
        }
      },

      // Export a conflicted item's payload as a downloadable JSON so
      // the user can preserve their data before abandoning the sync.
      exportPendingOutingAsJson(item) {
        const blob = new Blob([JSON.stringify(item.payload, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sortie-brouillon-${item.id || Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Delay the revoke so slow browsers (iOS Safari especially)
        // have time to start the download before the blob URL becomes
        // invalid — the synchronous revoke pattern silently fails on
        // some devices.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },

      async removePendingOuting(id) {
        await store.removePendingOuting(id);
        this.pendingOutings = await store.listPendingOutings();
      },
    },
  });

  Vue.prototype.$offline = vm;
}

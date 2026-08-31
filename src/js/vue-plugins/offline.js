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

async function prefetchUrl(url) {
  try {
    // no-cors: browser-issued <img> requests are also no-cors, so the cached
    // opaque response will match cleanly when the image is rendered offline.
    // Using cors here would fail for any C2C image host that does not send
    // Access-Control-Allow-Origin (which is most of them) and would leave us
    // with zero cached images.
    await fetch(url, { cache: 'reload', mode: 'no-cors' });
  } catch {
    // ignore individual failures — the image just won't be available offline
  }
}

async function prefetchImageVariants(imageDoc) {
  if (!imageDoc) {
    return;
  }
  for (const size of IMAGE_SIZES_TO_PREFETCH) {
    const url = getImageUrl(imageDoc, size);
    if (url) {
      await prefetchUrl(url);
    }
  }
}

async function prefetchSrcsFromCooked(cooked) {
  for (const url of extractImageUrlsFromCooked(cooked, config.urls.api)) {
    // We pull both real src= URLs and reconstructed c2c:url-proxy URLs so the
    // service worker caches exactly the URLs the browser will request when
    // rendering the topo offline (including avif/webp <picture> variants).
    await prefetchUrl(url);
  }
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
  const geom = data?.geometry?.geom_detail || data?.geometry?.geom;
  const bbox = getLonLatBboxFromC2cGeom(geom);
  if (!bbox) {
    return;
  }
  const urls = buildOpenTopoMapTileUrls(bbox);
  // We fire requests in small parallel batches so the tile servers do not
  // see a single burst of 200 connections (some throttle aggressively).
  const BATCH = 6;
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    await Promise.all(slice.map((url) => prefetchUrl(url)));
  }
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

export default function install(Vue) {
  const vm = new Vue({
    name: 'OfflinePlugin',

    data() {
      return {
        online: navigator.onLine,
        savedDocs: [],
        folders: [],
        pendingOutings: [],
        downloading: new Set(),
        syncing: false,
      };
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
        this.online = true;
        if (this.pendingOutings.length) {
          this.syncPendingOutings();
        }
      },

      handleOffline() {
        this.online = false;
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

      isDownloading(type, id, lang) {
        return this.downloading.has(`${type}/${id}/${lang}`);
      },

      async saveDocument({ type, id, lang, folderId = null }) {
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
          await store.saveDocument({ type, id, lang, data, folderId });
          // Strategy: cache the EXACT URLs the browser will request when
          // rendering the topo offline.
          //
          // 1) Pull every src= URL out of the cooked HTML and fetch them as-is.
          //    Whatever pattern the server-side cooker emits (proxy URL, media
          //    direct, etc.) is what the browser will ask for later, so this
          //    is the most reliable way to populate the SW image cache.
          await prefetchSrcsFromCooked(data?.cooked);

          // 2) Gallery images (associations.images): prefetch the size
          //    variants the gallery template usually requests (MI for the
          //    grid, SI for the thumbnail strip). These go through getImageUrl
          //    which constructs the same URL the gallery will build.
          const associatedImages = Array.isArray(data?.associations?.images) ? data.associations.images : [];
          for (const image of associatedImages) {
            try {
              await prefetchImageVariants(image);
            } catch {
              /* ignore */
            }
          }

          // 3) Pre-cache map tiles around the trace so the user has the
          //    topographic base layer offline (OpenTopoMap by default, the C2C
          //    fallback layer). Run in the background — the "saved" feedback
          //    has already fired, no need to block on this.
          prefetchTilesForDocument(data).catch(() => {
            /* tile prefetch is best-effort */
          });

          // 4) Also persist the lightweight image metadata for images that are
          //    embedded by id (so a later code path that calls c2c.image.get…
          //    on them still resolves offline).
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
              });
              await prefetchImageVariants(imgResponse.data);
            } catch {
              /* ignore */
            }
          }
          await this.refresh();
        } finally {
          const next = new Set(this.downloading);
          next.delete(key);
          this.downloading = next;
        }
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

      async createFolder(name) {
        const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await store.saveFolder({ id, name });
        await this.refresh();
        return id;
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
        await this.saveDocument({ type, id, lang, folderId });

        const mainDoc = await store.getDocument(type, id, lang);
        const associations = mainDoc?.associations ?? {};
        const associatedWaypoints = [...(associations.waypoints ?? []), ...(associations.waypoint_children ?? [])];
        for (const wp of associatedWaypoints) {
          const wpId = wp?.document_id;
          if (!wpId) continue;
          if (this.isSaved('waypoint', wpId, lang)) continue;
          try {
            await this.saveDocument({ type: 'waypoint', id: wpId, lang, folderId });
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

      // Purge every saved document + folder. Pending outings are left
      // alone on purpose: they represent unsync'd user data and losing
      // them silently would be a real data-loss regression. If the user
      // wants to drop those too, they can discard each pending item
      // from the OfflineView list.
      async purgeAllDocuments() {
        const docs = this.savedDocs.slice();
        for (const d of docs) {
          try {
            await store.deleteDocument(d.type, d.id, d.lang);
          } catch {
            /* keep going — one failure shouldn't halt the purge */
          }
        }
        const folders = this.folders.slice();
        for (const f of folders) {
          try {
            await store.deleteFolder(f.id);
          } catch {
            /* ditto */
          }
        }
        await this.refresh();
      },

      async queueOuting(document, { photos = [] } = {}) {
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
        });
        this.pendingOutings = await store.listPendingOutings();
        return entry;
      },

      async syncPendingOutings() {
        if (this.syncing || !this.online) {
          return;
        }
        const queue = await store.listPendingOutings();
        if (!queue.length) {
          return;
        }
        this.syncing = true;
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
        this.syncing = false;

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

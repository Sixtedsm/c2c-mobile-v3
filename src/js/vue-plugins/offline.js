import { toast } from 'bulma-toast';
import Vue from 'vue';

import c2c from '@/js/apis/c2c';
import config from '@/js/config';
import { getImageUrl } from '@/js/image-urls';
import ol from '@/js/libs/ol';
import * as store from '@/pwa/offline-store';

const EMBEDDED_IMAGE_REGEX = /<img[^<>]+c2c:document-id="(\d+)"/gm;
const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gim;
// The C2C cooker emits embedded images without a real src; the Markdown
// component rebuilds the URL at render time from this attribute.
const URL_PROXY_REGEX = /<img\b[^>]*\bc2c:url-proxy\s*=\s*["']([^"']+)["']/gim;
// Modern thumbnails are served in three formats and the <picture> element
// picks the best one supported; we have to cache all three to guarantee
// offline rendering whatever the browser picks.
const IMAGE_FORMATS = ['', 'avif', 'webp'];
const IMAGE_SIZES_TO_PREFETCH = ['MI', 'SI'];

function extractImageUrlsFromCooked(cooked) {
  const out = new Set();
  if (!cooked) {
    return out;
  }
  const apiBase = config.urls.api;
  const visit = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    if (value.indexOf('<img') === -1) {
      return;
    }
    let match;

    // 1) Direct src=… (already-rendered images, gallery thumbnails, etc.)
    IMG_SRC_REGEX.lastIndex = 0;
    while ((match = IMG_SRC_REGEX.exec(value)) !== null) {
      out.add(match[1]);
    }

    // 2) c2c:url-proxy=… (embedded figures rebuilt client-side by
    //    Markdown.vue#computeImages). For each proxy URL we precache the
    //    three format variants the runtime <picture> element will try.
    URL_PROXY_REGEX.lastIndex = 0;
    while ((match = URL_PROXY_REGEX.exec(value)) !== null) {
      const proxyPath = match[1];
      for (const fmt of IMAGE_FORMATS) {
        const url = apiBase + proxyPath + (fmt ? `&extension=${fmt}` : '');
        out.add(url);
      }
    }
  };
  if (typeof cooked === 'string') {
    visit(cooked);
  } else if (typeof cooked === 'object') {
    for (const value of Object.values(cooked)) {
      visit(value);
    }
  }
  return out;
}

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
  for (const url of extractImageUrlsFromCooked(cooked)) {
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

function extractEmbeddedImageIds(cooked) {
  if (!cooked) {
    return [];
  }
  const ids = new Set();
  const collect = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    let match;
    EMBEDDED_IMAGE_REGEX.lastIndex = 0;
    while ((match = EMBEDDED_IMAGE_REGEX.exec(value)) !== null) {
      ids.add(match[1]);
    }
  };
  if (typeof cooked === 'string') {
    collect(cooked);
  } else if (typeof cooked === 'object') {
    for (const value of Object.values(cooked)) {
      collect(value);
    }
  }
  return [...ids];
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

    async created() {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      await this.refresh();
      if (this.online && this.pendingOutings.length) {
        this.syncPendingOutings();
      }
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
        await store.deleteFolder(id);
        await this.refresh();
      },

      async moveDocumentToFolder(type, id, lang, folderId) {
        await store.setDocumentFolder(type, id, lang, folderId);
        await this.refresh();
      },

      async getDocument(type, id, lang) {
        return store.getDocument(type, id, lang);
      },

      async getStorageUsage() {
        return store.estimateUsage();
      },

      async queueOuting(document) {
        const entry = await store.enqueuePendingOuting({
          payload: document,
          title: document?.locales?.[0]?.title || this.$gettext?.('Untitled') || 'Untitled',
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
        for (const item of queue) {
          try {
            const response = await c2c.outing.create(item.payload);
            if (!response?.data?.document_id) {
              remaining.push({ ...item, attempts: item.attempts + 1, lastError: 'no-id' });
            } else {
              published += 1;
            }
          } catch (error) {
            remaining.push({
              ...item,
              attempts: item.attempts + 1,
              lastError: error?.response?.status ?? 'network',
            });
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
            message:
              published === 1
                ? `1 sortie publiée en ligne.`
                : `${published} sorties publiées en ligne.`,
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
      },

      async removePendingOuting(id) {
        await store.removePendingOuting(id);
        this.pendingOutings = await store.listPendingOutings();
      },
    },
  });

  Vue.prototype.$offline = vm;
}

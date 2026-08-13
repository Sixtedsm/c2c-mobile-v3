// Extractors used by the offline plugin to pull image URLs + embedded
// image ids out of C2C's cooked HTML output. Lives in its own module
// so:
//   1) the offline plugin stays focused on orchestration, and
//   2) the regex logic is unit-testable in isolation (no Vue, no
//      IndexedDB shim, no fetch).
//
// Every regex is returned by a factory so parallel callers can't race
// each other through a shared `lastIndex` on a global regex — that was
// a real latent bug when concurrent saveDocument calls overlapped.

// Modern C2C thumbnails come in three formats served via a <picture>
// element; we cache every variant so runtime rendering picks whatever
// the browser prefers.
const IMAGE_FORMATS = ['', 'avif', 'webp'];

const embeddedImageRegex = () => /<img[^<>]+c2c:document-id="(\d+)"/gm;
const imgSrcRegex = () => /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gim;
// The C2C cooker emits embedded images without a real src; the Markdown
// component rebuilds the URL at render time from this attribute.
const urlProxyRegex = () => /<img\b[^>]*\bc2c:url-proxy\s*=\s*["']([^"']+)["']/gim;

function iterateStringOrObject(cooked, visit) {
  if (typeof cooked === 'string') {
    visit(cooked);
  } else if (cooked && typeof cooked === 'object') {
    for (const value of Object.values(cooked)) {
      visit(value);
    }
  }
}

export function extractImageUrlsFromCooked(cooked, apiBase) {
  const out = new Set();
  if (!cooked) return out;

  const srcRe = imgSrcRegex();
  const proxyRe = urlProxyRegex();
  const visit = (value) => {
    if (typeof value !== 'string' || value.indexOf('<img') === -1) return;
    let match;
    srcRe.lastIndex = 0;
    while ((match = srcRe.exec(value)) !== null) {
      out.add(match[1]);
    }
    proxyRe.lastIndex = 0;
    while ((match = proxyRe.exec(value)) !== null) {
      const proxyPath = match[1];
      for (const fmt of IMAGE_FORMATS) {
        out.add(apiBase + proxyPath + (fmt ? `&extension=${fmt}` : ''));
      }
    }
  };
  iterateStringOrObject(cooked, visit);
  return out;
}

export function extractEmbeddedImageIds(cooked) {
  const ids = new Set();
  if (!cooked) return [];
  const re = embeddedImageRegex();
  const visit = (value) => {
    if (typeof value !== 'string') return;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(value)) !== null) {
      ids.add(match[1]);
    }
  };
  iterateStringOrObject(cooked, visit);
  return [...ids];
}

export { IMAGE_FORMATS };

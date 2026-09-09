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

// A Discourse title, as plain text.
//
// `fancy_title` is HTML: Discourse applies typographic substitutions
// (curly quotes, dashes) and encodes them as entities, and it inlines
// emoji as <img> tags. Rendered through a Vue interpolation — which
// escapes, correctly — the reader gets `Topo &rdquo;jeux d&rsquo;enfants&rdquo;`
// instead of the title (feedback gilles74, forum 2026-09-08).
//
// Decoding to text rather than rendering the HTML is the deliberate
// choice: these strings come from other people's posts, and a title is
// never worth an injection surface. Tags are dropped, entities resolved,
// and the result is only ever interpolated as text.
export function plainTitle(fancyTitle, fallback = '') {
  const source = typeof fancyTitle === 'string' && fancyTitle ? fancyTitle : fallback;
  if (typeof source !== 'string' || !source) return '';
  // Nothing to do for a title carrying no markup — the common case.
  if (!/[<&]/.test(source)) return source.trim();

  // Tags go first, by string surgery, so nothing is ever parsed as an
  // element: `holder.innerHTML = source` on a <div> would build real
  // nodes, and some browsers start fetching an <img> even in a detached
  // subtree — which is an onerror handler away from being a problem.
  const withoutTags = source.replace(/<[^>]*>/g, '');

  if (typeof document === 'undefined' || !document.createElement) return withoutTags.trim();
  // A textarea is inert by construction: its content is RCDATA, so
  // assigning innerHTML creates no elements at all, only decodes the
  // character references. Anything that still looks like a tag after
  // this is plain text, and every caller interpolates it as text.
  const holder = document.createElement('textarea');
  holder.innerHTML = withoutTags;
  // Collapse whitespace: dropping an inlined emoji otherwise leaves a
  // double space in the middle of the title.
  return (holder.value || '').replace(/\s+/g, ' ').trim();
}

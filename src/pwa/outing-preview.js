// Turn the outing being edited into something the published-outing
// renderer can draw (CDC §4.4, "prévisualisation avant publication").
//
// The two shapes differ in one way that matters. The edition form holds
// raw markdown in `locales[]`; the view reads rendered HTML from a single
// `cooked` locale. Bridging them is this module's whole job — the HTML
// itself comes from the API's /cooker endpoint, so the preview shows the
// markup the site will actually produce rather than a second renderer's
// guess at it.
//
// Everything else is passed through untouched: the numeric fields, the
// activities, the ratings are already in their final shape on the form.

const EMPTY_ASSOCIATIONS = ['routes', 'users', 'images', 'waypoints'];

// Pick the locale being edited. Falls back to the first one so a preview
// is still possible when the requested language has no locale yet.
export function findLocale(document, lang) {
  const locales = Array.isArray(document?.locales) ? document.locales : [];
  return locales.find((l) => l.lang === lang) ?? locales[0] ?? null;
}

export function buildPreviewDocument(document, cookedLocale, lang) {
  const associations = { ...(document?.associations ?? {}) };
  // The renderer iterates these without guarding. A new outing often has
  // none of them, and an undefined association would break the preview
  // on exactly the documents most in need of one.
  for (const key of EMPTY_ASSOCIATIONS) {
    if (!Array.isArray(associations[key])) {
      associations[key] = [];
    }
  }

  return {
    ...document,
    associations,
    cooked: {
      ...(cookedLocale ?? {}),
      // The cooker passes `lang` straight through, but a locale that was
      // never sent to it (nothing to cook) would arrive without one.
      lang: cookedLocale?.lang ?? lang,
    },
  };
}

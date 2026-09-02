// Previewing an outing before publishing it (CDC §4.4).
//
// V1 already previews markdown, but per field, inside the editor: it
// answers "is my formatting right", not "is this what the community will
// see". The preview shows the whole outing through the very component the
// published page uses, so the two cannot drift.
//
// This module is the bridge between the two document shapes — the form
// holds raw markdown in `locales[]`, the renderer reads rendered HTML from
// a single `cooked` locale — and the bridge is where a draft can quietly
// break the renderer.

import { describe, expect, it } from 'vitest';

import { buildPreviewDocument, findLocale } from '@/pwa/outing-preview';

const editDocument = {
  activities: ['skitouring'],
  height_diff_up: 1200,
  length_total: 14000,
  locales: [
    { lang: 'fr', title: 'Voie normale', description: '**beau**' },
    { lang: 'en', title: 'Normal route', description: 'nice' },
  ],
  associations: { routes: [{ document_id: 42 }] },
};

describe('findLocale', () => {
  it('picks the language being edited', () => {
    expect(findLocale(editDocument, 'en').title).toBe('Normal route');
  });

  it('falls back to the first locale rather than giving up', () => {
    // Previewing a language that has no locale yet must still show
    // something — the alternative is a blank modal on a real draft.
    expect(findLocale(editDocument, 'de').title).toBe('Voie normale');
  });

  it('copes with a document that has no locales at all', () => {
    expect(findLocale({}, 'fr')).toBeNull();
    expect(findLocale(undefined, 'fr')).toBeNull();
  });
});

describe('buildPreviewDocument', () => {
  it('exposes the cooked locale where the renderer looks for it', () => {
    const cooked = { lang: 'fr', title: 'Voie normale', description: '<strong>beau</strong>' };
    const preview = buildPreviewDocument(editDocument, cooked, 'fr');

    expect(preview.cooked.description).toBe('<strong>beau</strong>');
    expect(preview.cooked.lang).toBe('fr');
  });

  it('passes the rest of the outing through untouched', () => {
    const preview = buildPreviewDocument(editDocument, { lang: 'fr' }, 'fr');
    // These are already in their final shape on the form — the numbers the
    // preview shows must be the numbers that get published.
    expect(preview.height_diff_up).toBe(1200);
    expect(preview.length_total).toBe(14000);
    expect(preview.activities).toEqual(['skitouring']);
  });

  it('fills in the associations the renderer iterates without guarding', () => {
    // A brand-new outing has none of these, and that is exactly the case
    // the preview matters most for. An undefined association would throw
    // inside the renderer instead of showing a draft.
    const preview = buildPreviewDocument({ locales: [] }, null, 'fr');
    expect(preview.associations.routes).toEqual([]);
    expect(preview.associations.users).toEqual([]);
    expect(preview.associations.images).toEqual([]);
    expect(preview.associations.waypoints).toEqual([]);
  });

  it('keeps the associations the draft already has', () => {
    const preview = buildPreviewDocument(editDocument, null, 'fr');
    expect(preview.associations.routes).toEqual([{ document_id: 42 }]);
    expect(preview.associations.users).toEqual([]);
  });

  it('still carries a lang when nothing was cooked', () => {
    // The cooker is skipped when a locale has no markdown to render; the
    // renderer still reads document.cooked.lang.
    expect(buildPreviewDocument(editDocument, null, 'en').cooked.lang).toBe('en');
  });

  it('does not mutate the document being edited', () => {
    const before = JSON.stringify(editDocument);
    buildPreviewDocument(editDocument, { lang: 'fr' }, 'fr');
    // The form is live behind the modal — writing to it from a preview
    // would edit the outing the user is still working on.
    expect(JSON.stringify(editDocument)).toBe(before);
  });
});

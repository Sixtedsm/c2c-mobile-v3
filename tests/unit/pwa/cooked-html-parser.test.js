import { describe, it, expect } from 'vitest';

import { extractEmbeddedImageIds, extractImageUrlsFromCooked, plainTitle } from '@/pwa/cooked-html-parser';

describe('extractImageUrlsFromCooked', () => {
  const apiBase = 'https://api.example';

  it('returns an empty set when cooked is falsy', () => {
    expect(extractImageUrlsFromCooked(null, apiBase).size).toBe(0);
    expect(extractImageUrlsFromCooked(undefined, apiBase).size).toBe(0);
    expect(extractImageUrlsFromCooked('', apiBase).size).toBe(0);
  });

  it('pulls direct src attributes from a plain string', () => {
    const cooked = '<img src="https://cdn/img1.jpg" /><p>text</p><img src=\'https://cdn/img2.png\'>';
    const urls = extractImageUrlsFromCooked(cooked, apiBase);
    expect([...urls]).toEqual(['https://cdn/img1.jpg', 'https://cdn/img2.png']);
  });

  it('expands c2c:url-proxy into three format variants (original, avif, webp)', () => {
    const cooked = '<img c2c:url-proxy="/proxy?id=42" />';
    const urls = extractImageUrlsFromCooked(cooked, apiBase);
    expect([...urls]).toEqual([
      'https://api.example/proxy?id=42',
      'https://api.example/proxy?id=42&extension=avif',
      'https://api.example/proxy?id=42&extension=webp',
    ]);
  });

  it('iterates every value when cooked is an object (locale map)', () => {
    const cooked = {
      description: '<img src="https://cdn/a.jpg">',
      access: '<img src="https://cdn/b.jpg">',
    };
    const urls = extractImageUrlsFromCooked(cooked, apiBase);
    expect(urls.has('https://cdn/a.jpg')).toBe(true);
    expect(urls.has('https://cdn/b.jpg')).toBe(true);
  });

  it('short-circuits on values that contain no <img (perf)', () => {
    const cooked = { text: 'no image here', title: 'still nothing' };
    expect(extractImageUrlsFromCooked(cooked, apiBase).size).toBe(0);
  });

  it('re-runs cleanly across calls (no shared lastIndex bleed)', () => {
    const cooked = '<img src="https://cdn/a.jpg">';
    const first = extractImageUrlsFromCooked(cooked, apiBase);
    const second = extractImageUrlsFromCooked(cooked, apiBase);
    expect([...first]).toEqual([...second]);
  });

  it('deduplicates identical URLs across multiple <img tags', () => {
    const cooked = '<img src="https://cdn/x.jpg"><br><img src="https://cdn/x.jpg">';
    expect(extractImageUrlsFromCooked(cooked, apiBase).size).toBe(1);
  });
});

describe('extractEmbeddedImageIds', () => {
  it('returns an empty array when cooked is falsy', () => {
    expect(extractEmbeddedImageIds(null)).toEqual([]);
    expect(extractEmbeddedImageIds(undefined)).toEqual([]);
  });

  it('extracts document ids from c2c:document-id attributes', () => {
    const cooked = '<img c2c:document-id="123"><img c2c:document-id="456">';
    expect(extractEmbeddedImageIds(cooked).sort()).toEqual(['123', '456']);
  });

  it('deduplicates ids that appear multiple times', () => {
    const cooked = '<img c2c:document-id="42"><br><img c2c:document-id="42">';
    expect(extractEmbeddedImageIds(cooked)).toEqual(['42']);
  });

  it('iterates every value when cooked is an object', () => {
    const cooked = {
      description: '<img c2c:document-id="1">',
      access: '<img c2c:document-id="2">',
    };
    expect(extractEmbeddedImageIds(cooked).sort()).toEqual(['1', '2']);
  });
});

// Discourse hands topic titles over as HTML: it applies typographic
// substitutions and encodes them as entities, and it inlines emoji as
// <img> tags. Interpolated by Vue — which escapes, correctly — the
// reader got `Topo &rdquo;jeux d&rsquo;enfants&rdquo;` where the title
// should be (feedback gilles74, forum 2026-09-08).
describe('plainTitle', () => {
  it('decodes the entities Discourse puts in a fancy title', () => {
    expect(plainTitle('Topo &rdquo;jeux d&rsquo;enfants&rdquo; à la grande gliere')).toBe(
      'Topo ”jeux d’enfants” à la grande gliere'
    );
    expect(plainTitle('Neige &amp; glace &lt;2000 m')).toBe('Neige & glace <2000 m');
  });

  it('drops the emoji images Discourse inlines', () => {
    expect(plainTitle('Sortie <img src="/images/emoji/smile.png" class="emoji" alt=":smile:"> réussie')).toBe(
      'Sortie réussie'
    );
  });

  it('returns a plain title untouched', () => {
    expect(plainTitle('A vendre SKIN P3 16 avec sac de compression')).toBe(
      'A vendre SKIN P3 16 avec sac de compression'
    );
  });

  it('falls back when there is no fancy title', () => {
    expect(plainTitle(null, 'Titre brut')).toBe('Titre brut');
    expect(plainTitle('', 'Titre brut')).toBe('Titre brut');
    expect(plainTitle(undefined, undefined)).toBe('');
  });

  it('never yields markup, whatever it is handed', () => {
    // These strings come from other people's posts. A title is not worth
    // an injection surface, so the result is always text — and every
    // caller interpolates it as text.
    const out = plainTitle('<b onmouseover="steal()">gras</b> et &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toMatch(/<b/);
    expect(out).toContain('gras');
    // The escaped script tag decodes to literal characters, which is
    // exactly what it should read as.
    expect(out).toContain('<script>alert(1)</script>');
  });
});

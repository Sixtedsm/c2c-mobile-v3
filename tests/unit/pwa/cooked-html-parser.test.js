import { describe, it, expect } from 'vitest';

import { extractEmbeddedImageIds, extractImageUrlsFromCooked } from '@/pwa/cooked-html-parser';

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

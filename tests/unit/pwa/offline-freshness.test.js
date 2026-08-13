import { describe, it, expect } from 'vitest';

import { ageLabel, freshnessOf, FRESHNESS_THRESHOLDS } from '@/pwa/offline-freshness';

const DAY = 24 * 3600 * 1000;
const NOW = 1700000000000; // fixed reference so tests aren't time-dependent

describe('freshnessOf', () => {
  it('returns "unknown" when savedAt is missing or non-numeric', () => {
    expect(freshnessOf(null, NOW)).toBe('unknown');
    expect(freshnessOf(undefined, NOW)).toBe('unknown');
    expect(freshnessOf('yesterday', NOW)).toBe('unknown');
  });

  it('treats a future timestamp as fresh (clock skew safety)', () => {
    expect(freshnessOf(NOW + DAY, NOW)).toBe('fresh');
  });

  it('returns "fresh" for docs saved less than 7 days ago', () => {
    expect(freshnessOf(NOW - 1, NOW)).toBe('fresh');
    expect(freshnessOf(NOW - 3 * DAY, NOW)).toBe('fresh');
    expect(freshnessOf(NOW - (7 * DAY - 1), NOW)).toBe('fresh');
  });

  it('returns "stale" between 7 and 30 days', () => {
    expect(freshnessOf(NOW - 7 * DAY, NOW)).toBe('stale');
    expect(freshnessOf(NOW - 14 * DAY, NOW)).toBe('stale');
    expect(freshnessOf(NOW - (30 * DAY - 1), NOW)).toBe('stale');
  });

  it('returns "very-stale" after 30 days', () => {
    expect(freshnessOf(NOW - 30 * DAY, NOW)).toBe('very-stale');
    expect(freshnessOf(NOW - 90 * DAY, NOW)).toBe('very-stale');
  });

  it('exposes the thresholds for consumers that want to render bars', () => {
    expect(FRESHNESS_THRESHOLDS.STALE_AFTER_MS).toBe(7 * DAY);
    expect(FRESHNESS_THRESHOLDS.VERY_STALE_AFTER_MS).toBe(30 * DAY);
  });
});

describe('ageLabel', () => {
  it('returns an empty string when savedAt is missing', () => {
    expect(ageLabel(null, NOW)).toBe('');
  });

  it('says "aujourd\'hui" for the current day', () => {
    expect(ageLabel(NOW - 3600 * 1000, NOW)).toBe("aujourd'hui");
  });

  it('says "hier" for one day', () => {
    expect(ageLabel(NOW - DAY, NOW)).toBe('hier');
  });

  it('says "il y a N jours" between 2 and 29 days', () => {
    expect(ageLabel(NOW - 3 * DAY, NOW)).toBe('il y a 3 jours');
    expect(ageLabel(NOW - 29 * DAY, NOW)).toBe('il y a 29 jours');
  });

  it('switches to months once past 30 days', () => {
    expect(ageLabel(NOW - 45 * DAY, NOW)).toBe('il y a 1 mois');
    expect(ageLabel(NOW - 90 * DAY, NOW)).toBe('il y a 3 mois');
  });
});

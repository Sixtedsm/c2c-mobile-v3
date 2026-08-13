import { describe, it, expect } from 'vitest';

import { haversine } from '@/pwa/haversine';

describe('haversine', () => {
  it('returns 0 when either point is missing', () => {
    expect(haversine(null, { lat: 45, lon: 6 })).toBe(0);
    expect(haversine({ lat: 45, lon: 6 }, null)).toBe(0);
    expect(haversine(null, null)).toBe(0);
  });

  it('returns 0 for identical points', () => {
    const p = { lat: 45.9, lon: 6.87 };
    expect(haversine(p, p)).toBe(0);
  });

  it('matches known Paris → New York distance within 1%', () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const newYork = { lat: 40.7128, lon: -74.006 };
    const meters = haversine(paris, newYork);
    const expectedMeters = 5837000; // canonical geodesic-lite
    expect(Math.abs(meters - expectedMeters) / expectedMeters).toBeLessThan(0.01);
  });

  it('gives ~3 m for a jitter-scale offset (used by the tracking filter)', () => {
    // Rough conversion: 1 arcsec of latitude ≈ 30.9 m.
    // 0.0000009° ≈ 0.1 m — well below our 3 m jitter floor.
    const a = { lat: 45.0, lon: 6.0 };
    const b = { lat: 45.00003, lon: 6.0 }; // ~3.3 m north
    const d = haversine(a, b);
    expect(d).toBeGreaterThan(3.0);
    expect(d).toBeLessThan(3.5);
  });

  it('is commutative', () => {
    const a = { lat: 45.9, lon: 6.87 };
    const b = { lat: 46.0, lon: 7.0 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 5);
  });
});

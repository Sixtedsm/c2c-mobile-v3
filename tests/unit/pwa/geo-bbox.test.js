import { describe, it, expect } from 'vitest';

import { bboxFromLonLatRadius, bboxFromPositions } from '@/pwa/geo-bbox';

// Minimal OpenLayers stub — the two helpers only touch `ol.proj.fromLonLat`
// and `ol.extent.buffer`. Faking them keeps the tests hermetic + fast
// (the real `ol` module drags in ~2 MB of ES modules).
const ol = {
  proj: {
    // Sphere-radius Web Mercator forward projection. Accurate enough
    // for equal-comparison in tests without the full OL implementation.
    fromLonLat([lon, lat]) {
      const R = 6378137;
      const x = ((lon * Math.PI) / 180) * R;
      const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
      return [x, y];
    },
  },
  extent: {
    // Rectangular buffer — matches ol.extent.buffer's contract for the
    // point-degenerate case (four corners collapsed onto one point).
    buffer(extent, meters) {
      return [extent[0] - meters, extent[1] - meters, extent[2] + meters, extent[3] + meters];
    },
  },
};

describe('bboxFromLonLatRadius', () => {
  it('returns a comma-separated bbox in EPSG:3857', () => {
    const bbox = bboxFromLonLatRadius(ol, 6.87, 45.9, 25);
    const parts = bbox.split(',').map(Number);
    expect(parts).toHaveLength(4);
    expect(parts.every(Number.isFinite)).toBe(true);
  });

  it('produces west < east and south < north', () => {
    const bbox = bboxFromLonLatRadius(ol, 6.87, 45.9, 25);
    const [w, s, e, n] = bbox.split(',').map(Number);
    expect(e).toBeGreaterThan(w);
    expect(n).toBeGreaterThan(s);
  });

  it('scales the buffer with the radius', () => {
    const small = bboxFromLonLatRadius(ol, 6.87, 45.9, 10).split(',').map(Number);
    const large = bboxFromLonLatRadius(ol, 6.87, 45.9, 100).split(',').map(Number);
    expect(large[2] - large[0]).toBeGreaterThan(small[2] - small[0]);
  });

  it('inflates the buffer at higher latitudes (cos(lat) correction)', () => {
    // Same radius (25 km) at Chamonix (45.9°) vs Svalbard (78°). The
    // Svalbard bbox in EPSG:3857 must be wider east-west so that the
    // real-world radius stays 25 km — otherwise the requested radius
    // silently under-shoots.
    const alps = bboxFromLonLatRadius(ol, 6.87, 45.9, 25).split(',').map(Number);
    const arctic = bboxFromLonLatRadius(ol, 15.0, 78.0, 25).split(',').map(Number);
    expect(arctic[2] - arctic[0]).toBeGreaterThan(alps[2] - alps[0]);
  });

  it('clamps the cos(lat) divisor to avoid division by zero near the pole', () => {
    expect(() => bboxFromLonLatRadius(ol, 0, 89.99, 10)).not.toThrow();
  });
});

describe('bboxFromPositions', () => {
  it('returns null for empty or missing inputs', () => {
    expect(bboxFromPositions(ol, [])).toBeNull();
    expect(bboxFromPositions(ol, null)).toBeNull();
    expect(bboxFromPositions(ol, undefined)).toBeNull();
  });

  it('returns a valid bbox for a single-point trace (padded)', () => {
    const bbox = bboxFromPositions(ol, [{ lat: 45.9, lon: 6.87 }], 500);
    const [w, s, e, n] = bbox.split(',').map(Number);
    expect(e).toBeGreaterThan(w);
    expect(n).toBeGreaterThan(s);
  });

  it('encloses every point of a multi-point trace', () => {
    const positions = [
      { lat: 45.9, lon: 6.87 },
      { lat: 45.92, lon: 6.9 },
      { lat: 45.88, lon: 6.85 },
    ];
    const [w, s, e, n] = bboxFromPositions(ol, positions, 0).split(',').map(Number);
    for (const p of positions) {
      const [x, y] = ol.proj.fromLonLat([p.lon, p.lat]);
      // Floor rounding can shave ~1 m — allow a 2 m slack.
      expect(x).toBeGreaterThanOrEqual(w - 2);
      expect(x).toBeLessThanOrEqual(e + 2);
      expect(y).toBeGreaterThanOrEqual(s - 2);
      expect(y).toBeLessThanOrEqual(n + 2);
    }
  });
});

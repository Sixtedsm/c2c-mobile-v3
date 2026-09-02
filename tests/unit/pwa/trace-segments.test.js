// The single answer to "where is this trace broken?".
//
// Three things depend on it and they must agree: the published distance
// and elevation, the exported GPX, and the trace drawn on the outing
// page. A disagreement between them is what a pause used to produce —
// figures counting a drive home as walking.

import { describe, expect, it } from 'vitest';

import { splitOnGaps } from '@/pwa/trace-segments';

const point = (lat, gap = false) => (gap ? { lat, lon: 6, gap: true } : { lat, lon: 6 });

describe('splitOnGaps', () => {
  it('returns one segment for an uninterrupted trace', () => {
    expect(splitOnGaps([point(1), point(2), point(3)])).toHaveLength(1);
  });

  it('opens a new segment at each flagged point', () => {
    const segments = splitOnGaps([point(1), point(2), point(3, true), point(4)]);
    expect(segments).toHaveLength(2);
    // The flagged point starts the new segment — it is where recording
    // picked back up, not where it left off.
    expect(segments[0].map((p) => p.lat)).toEqual([1, 2]);
    expect(segments[1].map((p) => p.lat)).toEqual([3, 4]);
  });

  it('handles several breaks in one outing', () => {
    expect(splitOnGaps([point(1), point(2, true), point(3, true), point(4)])).toHaveLength(3);
  });

  it('never loses a point', () => {
    const positions = [point(1), point(2, true), point(3), point(4, true)];
    const kept = splitOnGaps(positions).flat();
    expect(kept).toHaveLength(positions.length);
  });

  it('copes with an empty or missing trace', () => {
    expect(splitOnGaps([])).toEqual([]);
    expect(splitOnGaps(undefined)).toEqual([]);
  });
});

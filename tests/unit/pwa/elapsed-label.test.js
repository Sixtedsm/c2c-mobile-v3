import { describe, it, expect } from 'vitest';

import { elapsedMs, formatDuration, formatElapsed } from '@/pwa/elapsed-label';

const NOW = 1700000000000;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('formatElapsed', () => {
  it('returns empty string when startedAt is falsy', () => {
    expect(formatElapsed(null, NOW)).toBe('');
    expect(formatElapsed(undefined, NOW)).toBe('');
    expect(formatElapsed(0, NOW)).toBe('');
  });

  it('returns "0 min" for a future startedAt (clock skew)', () => {
    expect(formatElapsed(NOW + HOUR, NOW)).toBe('0 min');
  });

  it('returns "N min" under an hour', () => {
    expect(formatElapsed(NOW - 5 * MIN, NOW)).toBe('5 min');
    expect(formatElapsed(NOW - 59 * MIN, NOW)).toBe('59 min');
  });

  it('returns "Nh MM" past an hour, zero-padded minutes', () => {
    expect(formatElapsed(NOW - HOUR, NOW)).toBe('1h00');
    expect(formatElapsed(NOW - (HOUR + 5 * MIN), NOW)).toBe('1h05');
    expect(formatElapsed(NOW - (3 * HOUR + 45 * MIN), NOW)).toBe('3h45');
  });

  it('rounds seconds down to the minute', () => {
    expect(formatElapsed(NOW - 30 * 1000, NOW)).toBe('0 min');
    expect(formatElapsed(NOW - 90 * 1000, NOW)).toBe('1 min');
  });
});

// Paused time is not outing time (CDC §2.4). A three-hour lunch at the
// refuge used to read as three hours of outing, because elapsed ran
// straight from startedAt.
describe('paused time is discounted', () => {
  const start = 1_700_000_000_000;

  it('subtracts a finished pause', () => {
    // Out for 2 h, one of them paused.
    expect(formatElapsed(start, start + 7_200_000, 3_600_000)).toBe('1h00');
  });

  it('subtracts a pause still running', () => {
    // Paused 30 min ago and still stopped: the clock froze there.
    const now = start + 7_200_000;
    expect(formatElapsed(start, now, 0, now - 1_800_000)).toBe('1h30');
  });

  it('counts both a finished and an open pause', () => {
    const now = start + 7_200_000;
    expect(formatElapsed(start, now, 1_800_000, now - 1_800_000)).toBe('1h00');
  });

  it('never goes negative on a clock skew', () => {
    expect(formatElapsed(start, start + 60_000, 3_600_000)).toBe('0 min');
  });

  it('is unchanged when nothing was paused', () => {
    expect(formatElapsed(start, start + 7_200_000)).toBe('2h00');
  });
});

// The same duration, as a number. The form compares it against how long
// the GPS actually recorded, to tell a trace that describes the outing
// apart from one that describes a coffee break.
describe('elapsedMs', () => {
  it('is zero without a start', () => {
    expect(elapsedMs(null, NOW)).toBe(0);
  });

  it('measures the wall clock when nothing was paused', () => {
    expect(elapsedMs(NOW, NOW + 2 * HOUR)).toBe(2 * HOUR);
  });

  it('subtracts finished and open pauses alike', () => {
    const now = NOW + 2 * HOUR;
    expect(elapsedMs(NOW, now, 30 * MIN, now - 30 * MIN)).toBe(HOUR);
  });

  it('clamps to zero rather than returning a negative duration', () => {
    expect(elapsedMs(NOW, NOW + MIN, HOUR)).toBe(0);
  });
});

// The same wording from a bare duration — what the outing form has when
// it reports how long the GPS actually recorded.
describe('formatDuration', () => {
  it('phrases hours and minutes like formatElapsed', () => {
    expect(formatDuration(2 * HOUR + 45 * MIN)).toBe('2h45');
    expect(formatDuration(12 * MIN)).toBe('12 min');
  });

  it('does not treat a zero duration as a missing one', () => {
    // formatElapsed returns '' for a falsy start; a duration of zero is a
    // real answer and has to read as one.
    expect(formatDuration(0)).toBe('0 min');
  });

  it('is defensive about junk', () => {
    expect(formatDuration(-5)).toBe('0 min');
    expect(formatDuration(undefined)).toBe('0 min');
  });
});

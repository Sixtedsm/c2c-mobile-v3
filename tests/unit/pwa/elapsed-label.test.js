import { describe, it, expect } from 'vitest';

import { formatElapsed } from '@/pwa/elapsed-label';

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

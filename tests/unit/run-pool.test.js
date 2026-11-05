// Offline downloads (photos, embedded images, map tiles) go through runPool.
// One at a time, a 33-photo topo took 7.6-9.3 s on a fast connection.
import { describe, expect, it } from 'vitest';

import runPool from '@/js/run-pool';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('runPool', () => {
  it('handles every item once, never more than `size` at a time', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const seen = [];
    let inFlight = 0;
    let peak = 0;
    await runPool(
      items,
      async (i) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await sleep(5);
        seen.push(i);
        inFlight -= 1;
      },
      6
    );
    expect(seen.sort((a, b) => a - b)).toEqual(items);
    expect(peak).toBe(6);
  });

  it('does not let one slow item hold back the others', async () => {
    const order = [];
    await runPool(
      ['slow', 'a', 'b', 'c'],
      async (x) => {
        await sleep(x === 'slow' ? 60 : 5);
        order.push(x);
      },
      2
    );
    // With fixed batches of 2, 'b' and 'c' would wait for 'slow'.
    expect(order.indexOf('slow')).toBe(3);
  });

  it('copes with an empty list', async () => {
    await expect(runPool([], async () => {}, 6)).resolves.toBeUndefined();
  });
});

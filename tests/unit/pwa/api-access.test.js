// "Network Error" was three different situations with one name.
//
// Since the API release of 2026-09-13 the Camptocamp API rejects requests
// whose Origin is not on its allowlist, and does it without CORS headers.
// The browser then refuses to show the answer, and axios reports the same
// "Network Error" it reports when the phone has no signal. Users saw red
// banners on every topo while their connection was fine, and the offline
// queue burned its retries on a server that was answering all along.
//
// Two probes tell the cases apart. A normal (CORS) request succeeds only
// if the API lets this app read its answers. A no-cors request succeeds
// whenever a server answers at all. Together:
//
//   cors ok                     → 'ok'
//   cors fails, no-cors ok      → 'refused'  (reachable, but not for us)
//   both fail                   → 'offline'

import { describe, expect, it, vi } from 'vitest';

import { probeApiAccess } from '@/pwa/api-access';

const BASE = 'https://api.example.test';

function fakeFetch({ cors, noCors }) {
  return vi.fn(async (url, options) => {
    const outcome = options?.mode === 'no-cors' ? noCors : cors;
    if (outcome === 'ok') return { ok: true, status: 200, type: options?.mode === 'no-cors' ? 'opaque' : 'cors' };
    if (outcome === 'abort') {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    throw new TypeError('Failed to fetch');
  });
}

describe('probeApiAccess', () => {
  it('reports ok when the API answers this app', async () => {
    const fetchImpl = fakeFetch({ cors: 'ok', noCors: 'ok' });
    expect(await probeApiAccess(BASE, { fetchImpl })).toBe('ok');
    // One request is enough when the first one works.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/health`);
  });

  it('reports refused when a server answers but will not let the app read it', async () => {
    const fetchImpl = fakeFetch({ cors: 'fail', noCors: 'ok' });
    expect(await probeApiAccess(BASE, { fetchImpl })).toBe('refused');
    expect(fetchImpl.mock.calls[1][1].mode).toBe('no-cors');
  });

  it('reports offline when nothing answers', async () => {
    const fetchImpl = fakeFetch({ cors: 'fail', noCors: 'fail' });
    expect(await probeApiAccess(BASE, { fetchImpl })).toBe('offline');
  });

  it('does not accuse the server of refusing when the network was merely slow', async () => {
    // A timeout says nothing about the allowlist. Calling it "refused"
    // would tell a user on a weak signal that Camptocamp blocks the app.
    const fetchImpl = fakeFetch({ cors: 'abort', noCors: 'ok' });
    expect(await probeApiAccess(BASE, { fetchImpl })).toBe('offline');
  });

  it('never sends credentials and never reuses a cached answer', async () => {
    const fetchImpl = fakeFetch({ cors: 'fail', noCors: 'ok' });
    await probeApiAccess(BASE, { fetchImpl });
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.credentials).toBe('omit');
      expect(options.cache).toBe('no-store');
    }
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const fetchImpl = fakeFetch({ cors: 'ok', noCors: 'ok' });
    await probeApiAccess(`${BASE}/`, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/health`);
  });

  it('never throws', async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('synchronous explosion');
    });
    expect(await probeApiAccess(BASE, { fetchImpl })).toBe('offline');
  });
});

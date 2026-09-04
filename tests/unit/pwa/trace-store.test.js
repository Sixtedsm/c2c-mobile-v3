// The store the trace now lives in.
//
// It replaces a single JSON.stringify of the whole array into
// localStorage — O(n) work on every flush, under a 5 MB origin quota
// shared with the auth token, and with every failure swallowed. The
// three properties that matter here are: what goes in comes out in
// order, a flush touches only the chunks that changed, and a failure is
// reported rather than absorbed.

import { clear, setMany } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', async (importOriginal) => {
  const actual = await importOriginal();
  // Real behaviour, observable call count: the whole point of chunking
  // is how little each flush writes, and that is invisible from the
  // outside otherwise.
  return { ...actual, setMany: vi.fn(actual.setMany) };
});

import {
  CHUNK_SIZE,
  classifyStorageError,
  deleteTrace,
  loadTrace,
  newTraceId,
  pruneTracesExcept,
  writeTail,
} from '@/pwa/trace-store';

const points = (from, to) =>
  Array.from({ length: to - from }, (_, i) => ({
    lat: 45 + (from + i) * 1e-5,
    lon: 6,
    alt: 1000,
    accuracy: 5,
    t: 1_700_000_000_000 + (from + i) * 5000,
  }));

beforeEach(async () => {
  await clear();
  setMany.mockClear();
});

describe('writeTail / loadTrace', () => {
  it('round-trips a trace in recorded order', async () => {
    const id = newTraceId();
    const trace = points(0, 450);

    const flushed = await writeTail(id, trace, 0);
    expect(flushed).toBe(450);

    const back = await loadTrace(id);
    expect(back).toHaveLength(450);
    expect(back[0].t).toBe(trace[0].t);
    expect(back[449].t).toBe(trace[449].t);
    // Order across chunk boundaries is the thing a naive key sort gets
    // wrong: "trace:x:10" sorts before "trace:x:2" as a string.
    expect(back.map((p) => p.t)).toEqual(trace.map((p) => p.t));
  });

  it('touches only the chunks that changed', async () => {
    const id = newTraceId();
    const trace = points(0, 3 * CHUNK_SIZE + 10);
    let flushed = await writeTail(id, trace, 0);

    setMany.mockClear();
    // One more point: only the tail chunk may be rewritten.
    trace.push(...points(trace.length, trace.length + 1));
    flushed = await writeTail(id, trace, flushed);

    expect(setMany).toHaveBeenCalledTimes(1);
    expect(setMany.mock.calls[0][0]).toHaveLength(1);
    expect(flushed).toBe(trace.length);
    expect(await loadTrace(id)).toHaveLength(trace.length);
  });

  it('writes every chunk a long append spans', async () => {
    const id = newTraceId();
    const trace = points(0, 10);
    const flushed = await writeTail(id, trace, 0);

    trace.push(...points(10, 10 + 2 * CHUNK_SIZE + 5));
    setMany.mockClear();
    await writeTail(id, trace, flushed);

    // Chunks 0 (rewritten, it was partial), 1 and 2.
    expect(setMany.mock.calls[0][0]).toHaveLength(3);
    expect(await loadTrace(id)).toHaveLength(trace.length);
  });

  it('reports the length captured before the write, not after it', async () => {
    // The recorder keeps pushing while the write is in flight. Returning
    // the later length would mark points as flushed that were never
    // written, and they would never be retried.
    const id = newTraceId();
    const trace = points(0, 50);
    const pending = writeTail(id, trace, 0);
    trace.push(...points(50, 70));
    expect(await pending).toBe(50);
  });

  it('is idempotent, so a repeated flush repairs rather than duplicates', async () => {
    const id = newTraceId();
    const trace = points(0, 120);
    await writeTail(id, trace, 0);
    await writeTail(id, trace, 0);
    expect(await loadTrace(id)).toHaveLength(120);
  });

  it('does nothing without a trace id or without points', async () => {
    expect(await writeTail(null, points(0, 5), 0)).toBe(0);
    expect(await writeTail(newTraceId(), [], 0)).toBe(0);
    expect(await loadTrace(null)).toEqual([]);
    expect(await loadTrace('never-written')).toEqual([]);
  });

  it('resets the cursor when the trace shrank under it', async () => {
    const id = newTraceId();
    expect(await writeTail(id, points(0, 10), 500)).toBe(10);
  });
});

describe('cleanup', () => {
  it('deletes one trace and leaves the others alone', async () => {
    const keep = newTraceId();
    const drop = newTraceId();
    await writeTail(keep, points(0, 300), 0);
    await writeTail(drop, points(0, 300), 0);

    await deleteTrace(drop);

    expect(await loadTrace(drop)).toEqual([]);
    expect(await loadTrace(keep)).toHaveLength(300);
  });

  it('prunes traces abandoned by earlier outings', async () => {
    const current = newTraceId();
    const abandoned = newTraceId();
    await writeTail(current, points(0, 50), 0);
    await writeTail(abandoned, points(0, 50), 0);

    // A recording discarded, or a tab killed between stop and save.
    // Without this these accumulate forever, which is the very failure
    // the module exists to prevent.
    expect(await pruneTracesExcept(current)).toBe(1);
    expect(await loadTrace(abandoned)).toEqual([]);
    expect(await loadTrace(current)).toHaveLength(50);
  });
});

describe('classifyStorageError', () => {
  it('tells a full store apart from a refusing one', () => {
    expect(classifyStorageError({ name: 'QuotaExceededError' })).toBe('quota');
    expect(classifyStorageError({ code: 22 })).toBe('quota');
    // Safari private mode.
    expect(classifyStorageError({ code: 1014 })).toBe('quota');
    expect(classifyStorageError(new Error('site data blocked'))).toBe('blocked');
    expect(classifyStorageError(null)).toBe(null);
  });
});

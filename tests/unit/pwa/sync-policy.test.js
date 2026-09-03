// When to stop retrying a queued outing.
//
// Two failures this encodes, both from the queue retrying blindly:
//
//   - A payload the API rejects permanently was retried on every
//     reconnect for the life of the install: network and battery spent
//     to fail identically, with a warning toast each time.
//   - A publish that failed with no HTTP status is ambiguous. The server
//     may have committed the outing and only the response been lost —
//     what a phone at the edge of coverage does — so retrying publishes
//     it a second time on the user's account.
//
// Nothing frozen is ever dropped: it surfaces in "Mes topos" with retry,
// export and discard, which is the user's call to make.

import { describe, expect, it } from 'vitest';

import { classifyFailure, freezeMessage, MAX_SYNC_ATTEMPTS } from '@/pwa/sync-policy';

describe('a permanently invalid payload stops immediately', () => {
  it('freezes on the first 400 rather than after three round trips', () => {
    const v = classifyFailure(400, 0);
    expect(v.freeze).toBe(true);
    expect(v.reason).toBe('invalid');
    // Sending the identical body again cannot produce a different answer.
    expect(v.ambiguous).toBe(false);
  });

  it('freezes a 404 the same way', () => {
    expect(classifyFailure(404, 0).freeze).toBe(true);
  });
});

describe('a conflict is the user’s call', () => {
  it('freezes on 409 and says why', () => {
    const v = classifyFailure(409, 0);
    expect(v.freeze).toBe(true);
    expect(v.reason).toBe('conflict');
  });
});

describe('transient failures are retried, but not forever', () => {
  it('retries a server error', () => {
    expect(classifyFailure(500, 0).freeze).toBe(false);
  });

  it('retries an expired session — logging back in fixes it', () => {
    expect(classifyFailure(401, 0).freeze).toBe(false);
    expect(classifyFailure(403, 0).freeze).toBe(false);
  });

  it('retries a timeout and a rate limit', () => {
    expect(classifyFailure(408, 0).freeze).toBe(false);
    expect(classifyFailure(429, 0).freeze).toBe(false);
  });

  it('gives up after the cap instead of retrying on every reconnect', () => {
    expect(classifyFailure(500, MAX_SYNC_ATTEMPTS - 1).freeze).toBe(true);
    expect(classifyFailure(500, MAX_SYNC_ATTEMPTS - 1).reason).toBe('exhausted');
  });

  it('counts the attempt that just failed', () => {
    expect(classifyFailure(500, 0).attemptsAfter).toBe(1);
  });
});

describe('a lost response is flagged as unknown, never silently republished', () => {
  it('marks a status-less failure ambiguous', () => {
    // The request may have reached the server and been committed.
    expect(classifyFailure(undefined, 0).ambiguous).toBe(true);
    expect(classifyFailure(null, 0).ambiguous).toBe(true);
  });

  it('does not call a server answer ambiguous', () => {
    expect(classifyFailure(500, 0).ambiguous).toBe(false);
    expect(classifyFailure(400, 0).ambiguous).toBe(false);
  });

  it('tells the user to check before republishing', () => {
    const message = freezeMessage('exhausted', true);
    expect(message).toMatch(/deux fois/);
  });

  it('does not raise the duplicate warning when the server answered', () => {
    expect(freezeMessage('exhausted', false)).not.toMatch(/deux fois/);
    expect(freezeMessage('invalid', false)).toMatch(/refusée/);
  });
});

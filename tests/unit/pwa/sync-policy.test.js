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

// A request that was sent and never answered is not the same failure as
// one that never left the phone, and treating them alike is how a single
// outing became two on someone's account.
describe('a request that timed out is not retried blind', () => {
  it('freezes on the first timeout instead of trying twice more', () => {
    const verdict = classifyFailure(undefined, 0, { timedOut: true });
    expect(verdict.freeze).toBe(true);
    expect(verdict.ambiguous).toBe(true);
    // Two more silent attempts, which is what this used to do, is two
    // more chances to create a copy.
    expect(verdict.attemptsAfter).toBe(1);
  });

  it('still asks the user to check before republishing', () => {
    const verdict = classifyFailure(undefined, 0, { timedOut: true });
    expect(freezeMessage(verdict.reason, verdict.ambiguous)).toMatch(/deux fois/);
  });

  it('keeps retrying a connection that never reached the server', () => {
    // A refused connection in a valley committed nothing, so retrying is
    // safe — and the offline queue exists precisely for that case.
    const verdict = classifyFailure(undefined, 0, { timedOut: false });
    expect(verdict.freeze).toBe(false);
    expect(verdict.attemptsAfter).toBe(1);
  });

  it('leaves every status-bearing verdict alone', () => {
    // A timeout carries no status, so the flag must not change how a
    // server answer is judged.
    expect(classifyFailure(409, 0, { timedOut: true }).reason).toBe('conflict');
    expect(classifyFailure(400, 0, { timedOut: true }).reason).toBe('invalid');
    expect(classifyFailure(429, 0, { timedOut: true }).freeze).toBe(false);
  });

  it('defaults to the previous behaviour when the caller says nothing', () => {
    expect(classifyFailure(undefined, 0)).toEqual(classifyFailure(undefined, 0, { timedOut: false }));
    expect(classifyFailure(undefined, MAX_SYNC_ATTEMPTS - 1).freeze).toBe(true);
  });
});

// Camptocamp itself can be down: in September 2026 its API served a
// maintenance page, on and off, for days. Three taps on "Publier
// maintenant" during such a stretch used to exhaust an outing's budget
// and freeze it as "plusieurs tentatives ont échoué" — a queued outing
// punished for an outage it had no part in.
describe('a site that is down is not the outing’s fault', () => {
  it('spends no attempt on 502, 503, 504 or 429', () => {
    for (const status of [502, 503, 504, 429]) {
      const verdict = classifyFailure(status, 2);
      expect(verdict.attemptsAfter).toBe(2);
      expect(verdict.freeze).toBe(false);
    }
  });

  it('never freezes an outing, however long the outage lasts', () => {
    let attempts = 0;
    for (let i = 0; i < 10; i++) {
      const verdict = classifyFailure(503, attempts);
      expect(verdict.freeze).toBe(false);
      attempts = verdict.attemptsAfter;
    }
    expect(attempts).toBe(0);
  });

  it('still counts a genuine server error', () => {
    expect(classifyFailure(500, 0).attemptsAfter).toBe(1);
    expect(classifyFailure(500, MAX_SYNC_ATTEMPTS - 1).freeze).toBe(true);
  });
});

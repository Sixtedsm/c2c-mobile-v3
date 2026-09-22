// What to do when publishing a queued outing fails.
//
// The queue used to retry everything, forever. Two consequences, both
// seen in normal use:
//
//   - An outing the API rejects for a permanent reason — a missing
//     activity, say — was retried on every reconnect, every focus and
//     every return to the foreground, for the life of the install. It
//     never succeeded, it cost network and battery each time, and it
//     raised a failure toast on each pass.
//   - A publish that failed with no HTTP status at all is genuinely
//     ambiguous: the request may have reached the server and only the
//     response been lost, which is exactly what a phone at the edge of
//     coverage does. Retrying blindly publishes the outing twice on the
//     user's account.
//
// So a failure is classified rather than blindly retried. Anything the
// policy freezes lands in the same place a conflict does, where the user
// is offered retry / export / discard — no queued outing is ever dropped
// on its own.

export const MAX_SYNC_ATTEMPTS = 3;

// Statuses worth another try even though the server answered: the
// session can be renewed and a timeout passes.
const RETRYABLE_STATUSES = new Set([401, 403, 408, 429]);

// The server is up but not serving: maintenance, restart, overload, rate
// limit. These say nothing about the outing, so they must not spend one
// of its three attempts — otherwise three taps on « Publier maintenant »
// during an outage freeze an outing the API never looked at. It happened:
// api.camptocamp.org served a maintenance page on and off for several
// days in September 2026.
const UNAVAILABLE_STATUSES = new Set([429, 502, 503, 504]);

export function isServerUnavailable(status) {
  return UNAVAILABLE_STATUSES.has(status);
}

// `attempts` is the count *before* this failure.
//
// `timedOut` says the request was sent and no answer ever came — as
// opposed to a connection that was never established. The difference
// matters more than it looks: a connection refused in a valley is safe to
// retry, because nothing reached the server, while a request that timed
// out may well have been committed. Retrying the second kind is how a
// single outing becomes two on someone's account.
export function classifyFailure(status, attempts, { timedOut = false } = {}) {
  const attemptsAfter = attempts + 1;

  if (status === 409) {
    // A referenced document moved under us. Only the user can decide.
    return { freeze: true, reason: 'conflict', ambiguous: false, attemptsAfter };
  }

  // Nothing to decide: the site is down, the outing is untouched.
  if (isServerUnavailable(status)) {
    return { freeze: false, reason: null, ambiguous: false, attemptsAfter: attempts };
  }

  const clientError = typeof status === 'number' && status >= 400 && status < 500;
  if (clientError && !RETRYABLE_STATUSES.has(status)) {
    // The payload is what it is: sending the identical body again will
    // fail identically. Freeze straight away rather than after three
    // pointless round trips.
    return { freeze: true, reason: 'invalid', ambiguous: false, attemptsAfter };
  }

  // No status means the exchange broke somewhere unknown — possibly
  // after the server had already committed the outing.
  const ambiguous = typeof status !== 'number';

  // The request went out and nothing came back. Blindly sending it again
  // is exactly the move that publishes a duplicate, so stop here and let
  // the user look — freezeMessage() below tells them what to look for.
  // Two more silent attempts, which is what this used to do, is two more
  // chances to create a copy.
  // Guarded on `ambiguous` too, so the flag can never override a verdict
  // the server actually gave us. A caller cannot produce that combination
  // today — axios only reports a timeout when no response arrived — but a
  // policy function should not depend on its caller's discipline.
  if (timedOut && ambiguous) {
    return { freeze: true, reason: 'exhausted', ambiguous: true, attemptsAfter };
  }

  if (attemptsAfter >= MAX_SYNC_ATTEMPTS) {
    return { freeze: true, reason: 'exhausted', ambiguous, attemptsAfter };
  }

  return { freeze: false, reason: null, ambiguous, attemptsAfter };
}

// The line shown next to a frozen item. Deliberately explicit about the
// one case where we cannot tell whether the outing went out, because the
// user is the only one who can look.
export function freezeMessage(reason, ambiguous, translate) {
  const t = typeof translate === 'function' ? translate : (m) => m;
  if (reason === 'conflict') {
    return t('Un document lié a changé entre-temps. À vérifier avant de republier.');
  }
  if (reason === 'invalid') {
    return t('La sortie a été refusée telle quelle. Corrigez-la ou abandonnez-la.');
  }
  if (ambiguous) {
    return t(
      'Impossible de savoir si cette sortie a été publiée : la connexion a été perdue au mauvais moment. Vérifiez sur Camptocamp avant de réessayer, pour ne pas la publier deux fois.'
    );
  }
  return t('Plusieurs tentatives ont échoué. Réessayez plus tard ou abandonnez la sortie.');
}
